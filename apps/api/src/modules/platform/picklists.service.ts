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
      return readEntries(settings?.metadata, kind)
        .filter((entry) => !entry.removed)
        .map((entry) => ({
          name: entry.name,
          archived: entry.archived,
          standard: entry.standard,
          usage: usage.get(entry.name.toLowerCase()) ?? { total: 0, active: 0 },
        }));
    });
  }

  async add(context: DomainContext, kind: PicklistKind, rawName: string) {
    requirePermission(context, PICKLISTS[kind].writePermission);
    const name = checkedName(rawName);
    return this.change(context, kind, 'PICKLIST_ENTRY_ADDED', (entries) => {
      const existing = entries.find((entry) => same(entry.name, name));
      // Adding a name that was archived or removed brings it back rather than making a second one.
      if (existing)
        return {
          entries: entries.map((e) =>
            e === existing ? { ...e, archived: false, removed: false } : e,
          ),
          result: existing.name,
        };
      return { entries: [...entries, { name, archived: false, standard: false }], result: name };
    });
  }

  /**
   * A new name for any entry, standard or the company's own. The records that carry it are
   * renamed with it, so the list and the people it describes never disagree — the way fixing a
   * misspelt role should work. A standard name is replaced by the company's own spelling.
   */
  async rename(context: DomainContext, kind: PicklistKind, from: string, rawTo: string) {
    requirePermission(context, PICKLISTS[kind].writePermission);
    const to = checkedName(rawTo);
    return this.change(context, kind, 'PICKLIST_ENTRY_RENAMED', async (entries, _usage, tx) => {
      const entry = find(entries, from);
      if (entries.some((e) => e !== entry && !e.removed && same(e.name, to)))
        throw new ConflictError(`"${to}" is already in the list.`);
      if (!same(entry.name, to)) await renameUses(tx, context.organizationId, kind, entry.name, to);
      if (!entry.standard)
        return { entries: entries.map((e) => (e === entry ? { ...e, name: to } : e)), result: to };
      // A standard name stays in the catalogue but leaves this company's list; its new spelling
      // is the company's own entry from here on.
      const renamed = entries.find((e) => e.removed && same(e.name, to));
      return {
        entries: [
          ...entries.map((e) =>
            e === entry
              ? { ...e, removed: true }
              : e === renamed
                ? { ...e, removed: false, archived: entry.archived }
                : e,
          ),
          ...(renamed ? [] : [{ name: to, archived: entry.archived, standard: false }]),
        ],
        result: to,
      };
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
      const used = usage.get(entry.name.toLowerCase())?.total ?? 0;
      if (used > 0)
        throw new ConflictError(
          `"${entry.name}" is used on ${used} record${used === 1 ? '' : 's'}, so it can only be archived.`,
        );
      // A standard name is hidden from this company's list; the company's own is deleted.
      return {
        entries: entry.standard
          ? entries.map((e) => (e === entry ? { ...e, removed: true } : e))
          : entries.filter((e) => e !== entry),
        result: entry.name,
      };
    });
  }

  private change(
    context: DomainContext,
    kind: PicklistKind,
    action: string,
    apply: (
      entries: StoredEntry[],
      usage: Map<string, Usage>,
      tx: TenantTransaction,
    ) =>
      | { entries: StoredEntry[]; result: string }
      | Promise<{ entries: StoredEntry[]; result: string }>,
  ) {
    return this.database.run(context, async (tx) => {
      // Locked first, so two changes at once are applied one after the other.
      const metadata = await lockSettings(tx, context.organizationId);
      const before = readEntries(metadata, kind);
      const { entries, result } = await apply(
        before,
        await usageOf(tx, context.organizationId, kind),
        tx,
      );
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
  const entry = entries.find((e) => !e.removed && same(e.name, name));
  if (!entry) throw new NotFoundError('Entry');
  return entry;
}

/** Gives every record that carries `from` the name `to`, whatever its case or spacing. */
async function renameUses(
  tx: TenantTransaction,
  organizationId: string,
  kind: PicklistKind,
  from: string,
  to: string,
) {
  const matches = { equals: from, mode: 'insensitive' as const };
  if (kind === 'project-roles')
    await tx.projectMember.updateMany({
      where: { organizationId, projectRole: matches },
      data: { projectRole: to },
    });
  else if (kind === 'team-roles')
    await tx.teamMember.updateMany({
      where: { organizationId, teamRole: matches },
      data: { teamRole: to },
    });
  else
    await tx.employeeEmploymentRecord.updateMany({
      where: { organizationId, jobTitle: matches },
      data: { jobTitle: to },
    });
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
