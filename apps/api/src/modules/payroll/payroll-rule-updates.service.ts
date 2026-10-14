import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { createHash, randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { requirePermission } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { notify, permissionHolders } from '../notifications/notify';
import { dateOnly, validateStatutoryRule, type StatutoryRuleInput } from './payroll-policy.types';
import { markPayrollStale } from './payroll-staleness';
import { sourcesForPayroll, type GovernmentRuleSource } from './payroll-government-sources';

export type RuleWatchJob = { organizationId?: string; force?: boolean };
export type RuleWatchResult = { checked: number; changed: number; failed: number };
const MAX_SOURCE_BYTES = 6 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

@Injectable()
export class PayrollRuleUpdatesService {
  private readonly logger = new Logger(PayrollRuleUpdatesService.name);

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    @InjectQueue('payroll-compliance-watch') private readonly queue: Queue<RuleWatchJob>,
  ) {}

  async requestSync(context: DomainContext) {
    requirePermission(context, 'payroll.policy.write');
    const job = await this.queue.add(
      'check-sources',
      { organizationId: context.organizationId, force: true },
      {
        jobId: `payroll-source-sync-${context.organizationId}-${Math.floor(Date.now() / 60_000)}`,
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: 100,
      },
    );
    return { queued: true, jobId: job.id };
  }

  async syncStatus(context: DomainContext, jobId: string) {
    requirePermission(context, 'payroll.policy.read');
    if (!jobId.startsWith(`payroll-source-sync-${context.organizationId}-`))
      throw new NotFoundError('Payroll source sync job');
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundError('Payroll source sync job');
    return {
      state: await job.getState(),
      result: (job.returnvalue as RuleWatchResult | null | undefined) ?? null,
      failedReason: job.failedReason,
    };
  }

  async list(context: DomainContext) {
    requirePermission(context, 'payroll.policy.read');
    return this.database.run(context, async (tx) => {
      const [checks, proposals] = await Promise.all([
        tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT source_key AS "sourceKey", scheme_code AS "schemeCode", jurisdiction,
                 checked_at AS "checkedAt",
                 source_changed_at AS "sourceChangedAt", last_error AS "lastError"
          FROM payroll_compliance_source_checks
          WHERE organization_id = ${context.organizationId}::uuid
          ORDER BY jurisdiction, scheme_code`,
        tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT id, source_key AS "sourceKey", source_hash AS "sourceHash", scheme_code AS "schemeCode",
                 jurisdiction, status,
                 change_summary AS "changeSummary", current_rule AS "currentRule",
                 proposed_rule AS "proposedRule", impact_preview AS "impactPreview",
                 effective_from AS "effectiveFrom", decided_at AS "decidedAt", decision_note AS "decisionNote",
                 created_at AS "createdAt"
          FROM payroll_rule_update_proposals
          WHERE organization_id = ${context.organizationId}::uuid
          ORDER BY CASE status WHEN 'NEEDS_REVIEW' THEN 0 WHEN 'READY' THEN 1 ELSE 2 END, created_at DESC
          LIMIT 100`,
      ]);
      const configured = await this.sourcesForOrganization(tx, context.organizationId);
      return {
        checks,
        proposals,
        sources: configured.sources.map(({ key, schemeCode, jurisdiction }) => ({
          key,
          schemeCode,
          jurisdiction,
        })),
        unsupportedJurisdictions: configured.unsupportedJurisdictions,
        nextAutomaticCheck: nextMonthStartUtc(),
      };
    });
  }

  async prepareProposal(
    context: DomainContext,
    proposalId: string,
    body: StatutoryRuleInput & { effectiveFrom: string; note?: string },
  ) {
    requirePermission(context, 'payroll.policy.write');
    validateStatutoryRule(body);
    const effectiveFrom = dateOnly(body.effectiveFrom);
    if (effectiveFrom < dateOnly(new Date().toISOString().slice(0, 10)))
      throw new ConflictError(
        'Government rule updates must not rewrite past payroll periods; choose today or a future effective date',
      );
    return this.database.run(context, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; scheme_code: string; jurisdiction: string; status: string }>
      >`
        SELECT id, scheme_code, jurisdiction, status FROM payroll_rule_update_proposals
        WHERE id = ${proposalId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const proposal = rows[0];
      if (!proposal) throw new NotFoundError('Payroll rule update proposal');
      if (!['NEEDS_REVIEW', 'READY'].includes(proposal.status))
        throw new ConflictError('This proposal has already been decided');
      const scheme = normalizeScheme(body.schemeCode);
      const jurisdiction = body.jurisdiction.trim().toUpperCase();
      if (scheme !== proposal.scheme_code || jurisdiction !== proposal.jurisdiction)
        throw new ConflictError(
          'The replacement rule must match the proposal scheme and jurisdiction',
        );
      const proposedRule = {
        ...body,
        schemeCode: scheme,
        jurisdiction,
        effectiveFrom: body.effectiveFrom,
      };
      const impact = await this.impactSummary(
        tx,
        context.organizationId,
        scheme,
        jurisdiction,
        effectiveFrom,
        body.effectiveTo ? dateOnly(body.effectiveTo) : undefined,
      );
      await tx.$executeRaw`
        UPDATE payroll_rule_update_proposals SET status = 'READY', proposed_rule = ${JSON.stringify(proposedRule)}::jsonb,
          effective_from = ${effectiveFrom}, impact_preview = ${JSON.stringify(impact)}::jsonb,
          decision_note = ${body.note?.trim() || null}, updated_at = now()
        WHERE id = ${proposalId}::uuid AND organization_id = ${context.organizationId}::uuid`;
      return { id: proposalId, status: 'READY', proposedRule, impactPreview: impact };
    });
  }

  async accept(context: DomainContext, proposalId: string, note?: string) {
    requirePermission(context, 'payroll.policy.write');
    return this.database.run(context, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          scheme_code: string;
          jurisdiction: string;
          status: string;
          proposed_rule: Prisma.JsonValue | null;
          effective_from: Date | null;
        }>
      >`
        SELECT id, scheme_code, jurisdiction, status, proposed_rule, effective_from
        FROM payroll_rule_update_proposals
        WHERE id = ${proposalId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const proposal = rows[0];
      if (!proposal) throw new NotFoundError('Payroll rule update proposal');
      if (proposal.status !== 'READY' || !proposal.proposed_rule || !proposal.effective_from)
        throw new ConflictError('Review and prepare the replacement rule before accepting it');
      const raw = proposal.proposed_rule as Record<string, unknown>;
      const input: StatutoryRuleInput = {
        schemeCode: String(raw.schemeCode),
        jurisdiction: String(raw.jurisdiction),
        effectiveFrom: proposal.effective_from.toISOString().slice(0, 10),
        ...(typeof raw.effectiveTo === 'string' && raw.effectiveTo
          ? { effectiveTo: raw.effectiveTo }
          : {}),
        ...(raw.employeeRate == null ? {} : { employeeRate: Number(raw.employeeRate) }),
        ...(raw.employerRate == null ? {} : { employerRate: Number(raw.employerRate) }),
        ...(raw.wageCeiling == null ? {} : { wageCeiling: Number(raw.wageCeiling) }),
        ...(raw.employeeThreshold == null
          ? {}
          : { employeeThreshold: Number(raw.employeeThreshold) }),
        ...(raw.flatAmount == null ? {} : { flatAmount: Number(raw.flatAmount) }),
        ...(raw.metadata && typeof raw.metadata === 'object'
          ? { metadata: raw.metadata as Record<string, unknown> }
          : {}),
      };
      validateStatutoryRule(input);
      const effectiveFrom = dateOnly(input.effectiveFrom);
      if (effectiveFrom < dateOnly(new Date().toISOString().slice(0, 10)))
        throw new ConflictError(
          'Government rule updates must not rewrite past payroll periods; prepare a current or future effective date',
        );
      const schemeCode = normalizeScheme(input.schemeCode);
      const jurisdiction = input.jurisdiction.toUpperCase();
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('End date precedes start date');

      const overlapping = await tx.payrollStatutoryRule.findMany({
        where: {
          organizationId: context.organizationId,
          schemeCode,
          jurisdiction,
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      for (const old of overlapping) {
        const dayBefore = new Date(effectiveFrom.getTime() - 86_400_000);
        if (old.effectiveFrom >= effectiveFrom) {
          throw new ConflictError(
            'A rule already starts on or after this date. Edit or resolve that rule first.',
          );
        }
        await tx.payrollStatutoryRule.update({
          where: { id: old.id },
          data: { effectiveTo: dayBefore },
        });
      }
      const rule = await tx.payrollStatutoryRule.create({
        data: {
          organizationId: context.organizationId,
          schemeCode,
          jurisdiction,
          effectiveFrom,
          effectiveTo,
          employeeRate: input.employeeRate == null ? null : new Prisma.Decimal(input.employeeRate),
          employerRate: input.employerRate == null ? null : new Prisma.Decimal(input.employerRate),
          wageCeiling: input.wageCeiling == null ? null : new Prisma.Decimal(input.wageCeiling),
          employeeThreshold:
            input.employeeThreshold == null ? null : new Prisma.Decimal(input.employeeThreshold),
          flatAmount: input.flatAmount == null ? null : new Prisma.Decimal(input.flatAmount),
          metadata: jsonSnapshot({
            ...(input.metadata ?? {}),
            source: 'GOVERNMENT_RULE_REVIEW',
            proposalId,
          }),
        },
      });
      await markPayrollStale(tx, context.organizationId, effectiveFrom, effectiveTo ?? undefined);
      await tx.$executeRaw`
        UPDATE payroll_rule_update_proposals SET status = 'ACCEPTED', decided_by_user_id = ${context.actor.userId ?? null}::uuid,
          decided_at = now(), decision_note = ${note?.trim() || null}, updated_at = now()
        WHERE id = ${proposalId}::uuid AND organization_id = ${context.organizationId}::uuid`;
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_RULE_UPDATE_PROPOSAL',
          entityId: proposalId,
          action: 'PAYROLL_GOVERNMENT_RULE_ACCEPTED',
          beforeState: jsonSnapshot(proposal),
          afterState: jsonSnapshot({ proposalId, rule, status: 'ACCEPTED' }),
          reason: note?.trim() || 'Approved verified government rule update',
        },
        tx,
      );
      return { id: proposalId, status: 'ACCEPTED', rule };
    });
  }

  async reject(context: DomainContext, proposalId: string, note?: string) {
    requirePermission(context, 'payroll.policy.write');
    return this.database.run(context, async (tx) => {
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT id, status, source_label AS "sourceLabel", jurisdiction FROM payroll_rule_update_proposals
        WHERE id = ${proposalId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const proposal = rows[0];
      if (!proposal) throw new NotFoundError('Payroll rule update proposal');
      if (!['NEEDS_REVIEW', 'READY'].includes(String(proposal.status)))
        throw new ConflictError('This proposal has already been decided');
      await tx.$executeRaw`
        UPDATE payroll_rule_update_proposals SET status = 'REJECTED', decided_by_user_id = ${context.actor.userId ?? null}::uuid,
          decided_at = now(), decision_note = ${note?.trim() || null}, updated_at = now()
        WHERE id = ${proposalId}::uuid AND organization_id = ${context.organizationId}::uuid`;
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_RULE_UPDATE_PROPOSAL',
          entityId: proposalId,
          action: 'PAYROLL_GOVERNMENT_RULE_REJECTED',
          beforeState: jsonSnapshot(proposal),
          afterState: jsonSnapshot({ status: 'REJECTED', note: note?.trim() || null }),
        },
        tx,
      );
      return { id: proposalId, status: 'REJECTED' };
    });
  }

  async runScheduled(job: RuleWatchJob = {}) {
    const organizations = job.organizationId
      ? [{ id: job.organizationId }]
      : await this.database.runSystem(undefined, (tx) =>
          tx.organization.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
        );
    let checked = 0;
    let changed = 0;
    let failed = 0;
    for (const org of organizations) {
      try {
        const result = await this.checkOrganization(systemContext(org.id), Boolean(job.force));
        checked += result.checked;
        changed += result.changed;
        failed += result.failed;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Payroll rule source check skipped for ${org.id}: ${errorMessage(error)}`);
      }
    }
    return { checked, changed, failed };
  }

  private async checkOrganization(context: DomainContext, force: boolean) {
    const config = await this.database.run(context, (tx) =>
      this.sourcesForOrganization(tx, context.organizationId),
    );
    let checked = 0;
    let changed = 0;
    let failed = 0;
    for (const source of config.sources) {
      try {
        const prior = await this.database.run(context, async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              content_hash: string | null;
              etag: string | null;
              last_modified: string | null;
              checked_at: Date | null;
              source_url: string;
            }>
          >`
            SELECT content_hash, etag, last_modified, checked_at, source_url FROM payroll_compliance_source_checks
            WHERE organization_id = ${context.organizationId}::uuid AND source_key = ${source.key}`;
          return rows[0] ?? null;
        });
        // A source URL change is a new baseline, not evidence that the law changed. Do not send
        // validators or compare a new official page against the prior page's content hash.
        const sameSource = prior?.source_url === source.url;
        if (!force && sameSource && prior?.checked_at && sameUtcMonth(prior.checked_at, new Date())) continue;
        const response = await fetchAllowlistedSource(source, sameSource ? prior : null);
        checked += 1;
        if (response.notModified) {
          await this.storeCheck(
            context,
            source,
            prior?.content_hash ?? null,
            prior?.etag ?? null,
            prior?.last_modified ?? null,
            null,
            false,
          );
          continue;
        }
        const hash = createHash('sha256').update(response.body).digest('hex');
        const hasPrior = sameSource && Boolean(prior?.content_hash);
        const didChange = hasPrior && prior!.content_hash !== hash;
        if (!didChange) {
          await this.storeCheck(
            context,
            source,
            hash,
            response.etag,
            response.lastModified,
            null,
            false,
          );
          continue;
        }
        const proposalId = await this.recordChangedSource(
          context,
          source,
          hash,
          response.etag,
          response.lastModified,
        );
        if (proposalId) changed += 1;
      } catch (error) {
        failed += 1;
        const message = errorMessage(error).slice(0, 500);
        await this.storeCheck(context, source, null, null, null, message, false).catch(
          () => undefined,
        );
        this.logger.warn(`Could not check ${source.key}: ${message}`);
      }
    }
    return { checked, changed, failed, unsupportedJurisdictions: config.unsupportedJurisdictions };
  }

  private async sourcesForOrganization(tx: Prisma.TransactionClient, organizationId: string) {
    const today = new Date();
    const [policies, employeePolicies] = await Promise.all([
      tx.payrollPolicy.findMany({
        where: { organizationId, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
        select: {
          pfDefault: true,
          esiDefault: true,
          ptDefault: true,
          statutoryJurisdiction: true,
        },
      }),
      tx.employeePayrollPolicy.findMany({
        where: {
          organizationId,
          payrollEnabled: true,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
        select: {
          pfEnabled: true,
          esiEnabled: true,
          ptEnabled: true,
          statutoryJurisdiction: true,
          payrollPolicy: { select: { statutoryJurisdiction: true } },
        },
      }),
    ]);
    const enabled = {
      epf:
        policies.some((policy) => policy.pfDefault) ||
        employeePolicies.some((policy) => policy.pfEnabled),
      esic:
        policies.some((policy) => policy.esiDefault) ||
        employeePolicies.some((policy) => policy.esiEnabled),
      pt:
        policies.some((policy) => policy.ptDefault) ||
        employeePolicies.some((policy) => policy.ptEnabled),
    };
    const jurisdictions = new Set<string>();
    if (enabled.pt) {
      policies
        .filter((policy) => policy.ptDefault && policy.statutoryJurisdiction)
        .forEach((policy) => jurisdictions.add(policy.statutoryJurisdiction!));
      employeePolicies
        .filter((policy) => policy.ptEnabled)
        .forEach((policy) => {
          const jurisdiction =
            policy.statutoryJurisdiction ?? policy.payrollPolicy?.statutoryJurisdiction;
          if (jurisdiction) jurisdictions.add(jurisdiction);
        });
    }
    const configured = sourcesForPayroll([...jurisdictions], enabled);
    if (enabled.pt && jurisdictions.size === 0) {
      configured.unsupportedJurisdictions.push('PT jurisdiction is not configured');
    }
    return configured;
  }

  private async storeCheck(
    context: DomainContext,
    source: GovernmentRuleSource,
    hash: string | null,
    etag: string | null,
    lastModified: string | null,
    error: string | null,
    sourceChanged: boolean,
  ) {
    return this.database.run(context, (tx) =>
      this.writeCheck(tx, context, source, hash, etag, lastModified, error, sourceChanged),
    );
  }

  private async recordChangedSource(
    context: DomainContext,
    source: GovernmentRuleSource,
    hash: string,
    etag: string | null,
    lastModified: string | null,
  ) {
    return this.database.run(context, async (tx) => {
      await this.writeCheck(tx, context, source, hash, etag, lastModified, null, true);
      return this.createProposal(tx, context, source, hash);
    });
  }

  private writeCheck(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    source: GovernmentRuleSource,
    hash: string | null,
    etag: string | null,
    lastModified: string | null,
    error: string | null,
    sourceChanged: boolean,
  ) {
    return tx.$executeRaw`
      INSERT INTO payroll_compliance_source_checks
        (organization_id, source_key, scheme_code, jurisdiction, source_label, source_url,
         content_hash, etag, last_modified, checked_at, source_changed_at, last_error, updated_at)
      VALUES (${context.organizationId}::uuid, ${source.key}, ${source.schemeCode}, ${source.jurisdiction},
        ${source.label}, ${source.url}, ${hash}, ${etag}, ${lastModified},
        CASE WHEN ${error} IS NULL THEN now() ELSE NULL END,
        CASE WHEN ${sourceChanged} THEN now() ELSE NULL END, ${error}, now())
      ON CONFLICT (organization_id, source_key) DO UPDATE SET
        scheme_code = EXCLUDED.scheme_code, jurisdiction = EXCLUDED.jurisdiction,
        source_label = EXCLUDED.source_label, source_url = EXCLUDED.source_url,
        content_hash = COALESCE(EXCLUDED.content_hash, payroll_compliance_source_checks.content_hash),
        etag = COALESCE(EXCLUDED.etag, payroll_compliance_source_checks.etag),
        last_modified = COALESCE(EXCLUDED.last_modified, payroll_compliance_source_checks.last_modified),
        checked_at = CASE WHEN EXCLUDED.last_error IS NULL THEN now() ELSE payroll_compliance_source_checks.checked_at END,
        source_changed_at = CASE WHEN ${sourceChanged} THEN now() ELSE payroll_compliance_source_checks.source_changed_at END,
        last_error = EXCLUDED.last_error, updated_at = now()`;
  }

  private async createProposal(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    source: GovernmentRuleSource,
    hash: string,
  ) {
    const current = await tx.payrollStatutoryRule.findFirst({
      where: {
        organizationId: context.organizationId,
        schemeCode: source.schemeCode,
        jurisdiction: source.jurisdiction,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    const currentRule = current
      ? {
          schemeCode: current.schemeCode,
          jurisdiction: current.jurisdiction,
          effectiveFrom: current.effectiveFrom.toISOString().slice(0, 10),
          effectiveTo: current.effectiveTo?.toISOString().slice(0, 10) ?? null,
          employeeRate: decimalNumber(current.employeeRate),
          employerRate: decimalNumber(current.employerRate),
          wageCeiling: decimalNumber(current.wageCeiling),
          employeeThreshold: decimalNumber(current.employeeThreshold),
          flatAmount: decimalNumber(current.flatAmount),
          metadata: current.metadata,
        }
      : null;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO payroll_rule_update_proposals
          (organization_id, source_key, source_hash, scheme_code, jurisdiction, source_label, source_url,
           status, change_summary, current_rule)
        VALUES (${context.organizationId}::uuid, ${source.key}, ${hash}, ${source.schemeCode}, ${source.jurisdiction},
          ${source.label}, ${source.url}, 'NEEDS_REVIEW',
          'The official source page changed. Verify the effective rule and enter confirmed values; no payroll rate was inferred.',
          ${currentRule == null ? null : JSON.stringify(currentRule)}::jsonb)
        ON CONFLICT (organization_id, source_key, source_hash) DO NOTHING RETURNING id`;
    const proposalId = rows[0]?.id;
    if (!proposalId) return null;
    const recipients = await permissionHolders(tx, context.organizationId, [
      'payroll.policy.write',
    ]);
    await notify(tx, context, {
      recipients,
      kind: 'PAYROLL_RULE_UPDATE_REVIEW',
      title: `Review ${source.schemeCode} rule update`,
      body: `The official ${source.label} source for ${source.jurisdiction} changed. Review the source before updating payroll.`,
      module: 'payroll',
      entityType: 'PAYROLL_RULE_UPDATE_PROPOSAL',
      entityId: proposalId,
    });
    return proposalId;
  }

  private async impactSummary(
    tx: Prisma.TransactionClient,
    organizationId: string,
    schemeCode: string,
    jurisdiction: string,
    effectiveFrom: Date,
    effectiveTo?: Date,
  ) {
    const employees = await tx.employee.count({ where: { organizationId, status: 'ACTIVE' } });
    const openRuns = await tx.payrollRun.count({
      where: {
        organizationId,
        status: { in: ['CALCULATED', 'APPROVED'] },
        calculationStaleAt: null,
        periodStart: { lte: effectiveTo ?? new Date('9999-12-31') },
        periodEnd: { gte: effectiveFrom },
      },
    });
    return {
      employeesPotentiallyAffected: employees,
      calculatedRunsToRecalculate: openRuns,
      releasedRunsChanged: 0,
      jurisdiction,
      schemeCode,
      effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
      summary:
        'The run count is the matching organization payroll calculations that acceptance will mark stale. Only runs covering the effective date or later are recalculated; released runs, issued payslips, and past payroll history are not rewritten.',
    };
  }
}

async function fetchAllowlistedSource(
  source: GovernmentRuleSource,
  prior: { etag: string | null; last_modified: string | null } | null,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = new Headers({
      'user-agent': 'SmarteamPayrollComplianceMonitor/1.0 (+official-source-change-detection)',
    });
    if (prior?.etag) headers.set('if-none-match', prior.etag);
    if (prior?.last_modified) headers.set('if-modified-since', prior.last_modified);
    let response = await fetch(source.url, {
      headers,
      signal: controller.signal,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || new URL(location, source.url).origin !== new URL(source.url).origin)
        throw new Error('Government source redirected outside its allowlisted host');
      response = await fetch(new URL(location, source.url), {
        headers,
        signal: controller.signal,
        redirect: 'manual',
      });
    }
    if (response.status === 304)
      return {
        notModified: true as const,
        body: Buffer.alloc(0),
        etag: prior?.etag ?? null,
        lastModified: prior?.last_modified ?? null,
      };
    if (!response.ok) throw new Error(`Official source responded HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_SOURCE_BYTES)
      throw new Error('Official source exceeds the configured size limit');
    const body = await readBoundedBody(response);
    if (body.byteLength === 0) throw new Error('Official source returned an empty response');
    const contentType = response.headers.get('content-type') ?? '';
    const normalized = /html|text/i.test(contentType)
      ? Buffer.from(normalizeHtml(body.toString('utf8')))
      : body;
    return {
      notModified: false as const,
      body: normalized,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Official source returned no response body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error('Official source exceeds the configured size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size,
  );
}

function normalizeHtml(text: string) {
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeScheme(value: string) {
  const scheme = value.trim().toUpperCase();
  return scheme === 'PF'
    ? 'EPF'
    : scheme === 'ESI'
      ? 'ESIC'
      : scheme === 'PROFESSIONAL_TAX'
        ? 'PT'
        : scheme;
}
function decimalNumber(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value.toString());
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function sameUtcMonth(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth()
  );
}
function nextMonthStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}
function systemContext(organizationId: string): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    correlationId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set(['payroll.policy.read', 'payroll.policy.write']),
  };
}
