import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import {
  lockSettings,
  normalizeName,
  PICKLISTS,
  readEntries,
  same,
  writeEntries,
  type PicklistKind,
  type StoredEntry,
} from './picklist-catalog';

export { isPicklistKind, PICKLISTS, type PicklistKind } from './picklist-catalog';

type Usage = { total: number; active: number };

/**
 * Managing the organization's reference lists (project roles, job titles, team roles): what each
 * holds and how often it is used, and adding, renaming, archiving, restoring and deleting entries.
 * A name still referenced by a record is never deleted, only archived: archived names are not
 * offered for new records, and the records that carry one keep showing it.
 */
@Injectable()
export class PicklistsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(context: DomainContext, kind: PicklistKind) {
    return this.database.run(context, async (tx) => {
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
        select: { metadata: true },
      });
      const usage = await usageOf(tx, context.organizationId, kind);
      return readEntries(settings?.metadata, kind).map((entry) => ({
        ...entry,
        usage: usage.get(entry.name.toLowerCase()) ?? { total: 0, active: 0 },
      }));
    });
  }

  async add(context: DomainContext, kind: PicklistKind, rawName: string) {
    requirePermission(context, PICKLISTS[kind].writePermission);
    const name = checkedName(rawName);
    return this.change(context, kind, 'PICKLIST_ENTRY_ADDED', (entries) => {
      const existing = entries.find((entry) => same(entry.name, name));
      // Adding a name that was archived brings it back rather than making a second one.
      if (existing)
        return {
          entries: entries.map((e) => (e === existing ? { ...e, archived: false } : e)),
          result: existing.name,
        };
      return { entries: [...entries, { name, archived: false, standard: false }], result: name };
    });
  }

  /** A new spelling for a company entry nothing uses yet. A used one is archived and replaced. */
  async rename(context: DomainContext, kind: PicklistKind, from: string, rawTo: string) {
    requirePermission(context, PICKLISTS[kind].writePermission);
    const to = checkedName(rawTo);
    return this.change(context, kind, 'PICKLIST_ENTRY_RENAMED', (entries, usage) => {
      const entry = find(entries, from);
      if (entry.standard) throw new ConflictError('Standard entries cannot be renamed.');
      if ((usage.get(entry.name.toLowerCase())?.total ?? 0) > 0)
        throw new ConflictError(
          `"${entry.name}" is already used, so renaming it would rewrite history. Archive it and add "${to}" instead.`,
        );
      if (entries.some((e) => e !== entry && same(e.name, to)))
        throw new ConflictError(`"${to}" is already in the list.`);
      return { entries: entries.map((e) => (e === entry ? { ...e, name: to } : e)), result: to };
    });
  }

  async setArchived(context: DomainContext, kind: PicklistKind, name: string, archived: boolean) {
    requirePermission(context, PICKLISTS[kind].writePermission);
    return this.change(
      context,
      kind,
      archived ? 'PICKLIST_ENTRY_ARCHIVED' : 'PICKLIST_ENTRY_RESTORED',
      (entries) => {
        const entry = find(entries, name);
        return {
          entries: entries.map((e) => (e === entry ? { ...e, archived } : e)),
          result: entry.name,
        };
      },
    );
  }

  /** Deletes a company entry that nothing has ever used; anything else is archived instead. */
  async remove(context: DomainContext, kind: PicklistKind, name: string) {
    requirePermission(context, PICKLISTS[kind].writePermission);
    return this.change(context, kind, 'PICKLIST_ENTRY_REMOVED', (entries, usage) => {
      const entry = find(entries, name);
      if (entry.standard)
        throw new ConflictError('Standard entries cannot be deleted; archive it.');
      const used = usage.get(entry.name.toLowerCase())?.total ?? 0;
      if (used > 0)
        throw new ConflictError(
          `"${entry.name}" is used on ${used} record${used === 1 ? '' : 's'}, so it can only be archived.`,
        );
      return { entries: entries.filter((e) => e !== entry), result: entry.name };
    });
  }

  private change(
    context: DomainContext,
    kind: PicklistKind,
    action: string,
    apply: (
      entries: StoredEntry[],
      usage: Map<string, Usage>,
    ) => { entries: StoredEntry[]; result: string },
  ) {
    return this.database.run(context, async (tx) => {
      // Locked first, so two changes at once are applied one after the other.
      const metadata = await lockSettings(tx, context.organizationId);
      const before = readEntries(metadata, kind);
      const { entries, result } = apply(before, await usageOf(tx, context.organizationId, kind));
      await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: { metadata: writeEntries(metadata, kind, entries) },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PICKLIST',
          entityId: context.organizationId,
          action,
          afterState: jsonSnapshot({ kind, name: result }),
        },
        tx,
      );
      return (
        readEntries(writeEntries(metadata, kind, entries), kind).find((e) =>
          same(e.name, result),
        ) ?? { name: result, archived: false, standard: false }
      );
    });
  }
}

function checkedName(raw: string) {
  const name = normalizeName(raw);
  if (name.length < 2 || name.length > 80)
    throw new ConflictError('Enter a name between 2 and 80 characters.');
  return name;
}

function find(entries: StoredEntry[], name: string) {
  const entry = entries.find((e) => same(e.name, name));
  if (!entry) throw new NotFoundError('Entry');
  return entry;
}

/** How many records carry each name (keyed in lower case), and how many of those are current. */
async function usageOf(tx: TenantTransaction, organizationId: string, kind: PicklistKind) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const rows: Array<{ name: string | null; current: boolean }> =
    kind === 'project-roles'
      ? (
          await tx.projectMember.findMany({
            where: { organizationId, projectRole: { not: null } },
            select: { projectRole: true, endsOn: true },
          })
        ).map((r) => ({ name: r.projectRole, current: !r.endsOn || r.endsOn >= today }))
      : kind === 'team-roles'
        ? (
            await tx.teamMember.findMany({
              where: { organizationId, teamRole: { not: null } },
              select: { teamRole: true, leftAt: true },
            })
          ).map((r) => ({ name: r.teamRole, current: !r.leftAt || r.leftAt >= today }))
        : (
            await tx.employeeEmploymentRecord.findMany({
              where: { organizationId, jobTitle: { not: null } },
              select: { jobTitle: true, effectiveTo: true },
            })
          ).map((r) => ({ name: r.jobTitle, current: !r.effectiveTo || r.effectiveTo >= today }));
  const usage = new Map<string, Usage>();
  for (const row of rows) {
    if (!row.name) continue;
    const key = normalizeName(row.name).toLowerCase();
    const entry = usage.get(key) ?? { total: 0, active: 0 };
    entry.total += 1;
    if (row.current) entry.active += 1;
    usage.set(key, entry);
  }
  return usage;
}
