import type { StatutoryRule } from '@smarteam/contracts';
import { payrollRepository } from '../../repositories/payroll.repository';
import { stateStatutoryRuleDefaults } from './statutory-rule-presets';

type EnsureRulesResult = {
  created: string[];
  unsupported: string[];
  notify: boolean;
  error?: unknown;
};
const inFlightSetup = new Map<string, Promise<EnsureRulesResult>>();

/** Create missing verified rules without overwriting an organization's custom rates. */
export function ensureStateStatutoryRules(
  organizationId: string,
  jurisdiction: string,
  enabled: { epf: boolean; esic: boolean; pt: boolean },
): Promise<EnsureRulesResult> {
  const normalizedJurisdiction = jurisdiction.trim().toUpperCase();
  if (!normalizedJurisdiction)
    return Promise.resolve({ created: [], unsupported: [], notify: false });

  // React Strict Mode and screen refreshes can run this effect twice. Share one request so both
  // calls do not race to create overlapping rows for the same tenant and jurisdiction.
  const key = `${organizationId}:${normalizedJurisdiction}:${Number(enabled.epf)}:${Number(enabled.esic)}:${Number(enabled.pt)}`;
  const pending = inFlightSetup.get(key);
  if (pending) return pending.then((result) => ({ ...result, notify: false }));

  const operation = createMissingStateRules(
    organizationId,
    normalizedJurisdiction,
    enabled,
  ).then(
    (result) => ({ ...result, notify: true }),
    (error: unknown) => ({ created: [], unsupported: [], notify: true, error }),
  );
  inFlightSetup.set(key, operation);
  const cleanup = () => {
    if (inFlightSetup.get(key) === operation) inFlightSetup.delete(key);
  };
  void operation.then(cleanup, cleanup);
  return operation;
}

async function createMissingStateRules(
  organizationId: string,
  jurisdiction: string,
  enabled: { epf: boolean; esic: boolean; pt: boolean },
): Promise<Omit<EnsureRulesResult, 'notify' | 'error'>> {
  const { rules: defaults, unsupported } = stateStatutoryRuleDefaults(jurisdiction, enabled);
  if (!defaults.length) return { created: [], unsupported };

  const existingRules = await payrollRepository.listStatutoryRules(organizationId, jurisdiction);
  const created: string[] = [];

  for (const rule of defaults) {
    // Statutory rates are effective from the date set by the government, not the date the
    // organization enabled the deduction default. Keeping those dates independent allows an
    // admin to configure the policy today and calculate an open historical draft using the rate
    // that was legally in force for that pay period. The policy's own effective date still
    // controls when the organization starts applying the deduction.
    const targetDate = rule.effectiveFrom;
    const sameSchemeAndState = existingRules.filter(
      (existing) =>
        normalizeScheme(existing.schemeCode) === normalizeScheme(rule.schemeCode) &&
        existing.jurisdiction.trim().toUpperCase() === jurisdiction,
    );
    // Do not stop just because a row covered the preset's original effective date. A later
    // organization default can close that row and leave a gap (for example, Oct 13) that makes
    // payroll say the rule is missing. Fill only uncovered date ranges and preserve every
    // company-entered interval as-is.
    const intervals = sameSchemeAndState
      .map((existing) => ({
        start: existing.effectiveFrom.slice(0, 10),
        end: existing.effectiveTo?.slice(0, 10) ?? null,
      }))
      .filter(({ end }) => end === null || end >= targetDate)
      .sort((left, right) => left.start.localeCompare(right.start));
    let cursor: string | null = targetDate;
    const gaps: Array<{ from: string; to?: string }> = [];

    for (const interval of intervals) {
      if (interval.end && interval.end < cursor) continue;
      if (interval.start > cursor) {
        gaps.push({ from: cursor, to: dayBefore(interval.start) });
      }
      if (interval.end === null) {
        cursor = null;
        break;
      }
      if (interval.end >= cursor) cursor = dayAfter(interval.end);
    }
    if (cursor !== null) gaps.push({ from: cursor });

    for (const gap of gaps) {
      const datedRule: Omit<StatutoryRule, 'id'> = {
        ...rule,
        effectiveFrom: gap.from,
        ...(gap.to ? { effectiveTo: gap.to } : {}),
      };

      try {
        await payrollRepository.saveStatutoryRule(organizationId, datedRule);
      } catch (error) {
        // Another tab or admin may have saved a row since this list was read. Ignore the race only
        // when the new persisted data now covers this exact gap; do not hide other validation errors.
        const refreshedRules = await payrollRepository.listStatutoryRules(
          organizationId,
          jurisdiction,
        );
        const concurrentlyCovered = refreshedRules.some((existing) => {
          const start = existing.effectiveFrom.slice(0, 10);
          const end = existing.effectiveTo?.slice(0, 10);
          return (
            normalizeScheme(existing.schemeCode) === normalizeScheme(rule.schemeCode) &&
            existing.jurisdiction.trim().toUpperCase() === jurisdiction &&
            start <= gap.from &&
            (!end || end >= gap.from)
          );
        });
        if (!concurrentlyCovered) throw error;
        existingRules.splice(0, existingRules.length, ...refreshedRules);
        continue;
      }
      created.push(rule.schemeCode);
      existingRules.push(datedRule);
    }
  }

  return { created, unsupported };
}

function normalizeScheme(value: string): string {
  const code = value.trim().toUpperCase();
  if (code === 'PF') return 'EPF';
  if (code === 'ESI') return 'ESIC';
  if (code === 'PROFESSIONAL_TAX') return 'PT';
  return code;
}

function dayBefore(value: string): string {
  return shiftDate(value, -1);
}

function dayAfter(value: string): string {
  return shiftDate(value, 1);
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
