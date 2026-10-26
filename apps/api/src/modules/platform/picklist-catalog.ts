import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';

/**
 * The organization's reference lists: names a form offers in a dropdown, each starting from a
 * standard set the company can extend, rename, archive and restore. System states (attendance,
 * leave, timesheet, payroll, membership status) are deliberately not here: they are fixed.
 *
 * Stored in the organization's settings beside the timesheet job types that already work this
 * way, so no table is added. `<key>` holds the company's own entries and `<key>Archived` the
 * standard names the company has retired.
 */
export const PICKLISTS = {
  'project-roles': {
    key: 'projectRoles',
    writePermission: 'projects.write',
    standard: [
      'Backend Developer',
      'Business Analyst',
      'Consultant',
      'DevOps Engineer',
      'Frontend Developer',
      'Project Manager',
      'QA Engineer',
      'Software Engineer',
      'Team Lead',
      'UI/UX Designer',
    ],
  },
  'job-titles': {
    key: 'jobTitles',
    writePermission: 'employees.write',
    standard: [
      'Accountant',
      'Designer',
      'Engineering Manager',
      'HR Executive',
      'HR Manager',
      'Intern',
      'Marketing Executive',
      'Operations Executive',
      'Product Manager',
      'QA Engineer',
      'Sales Executive',
      'Senior Software Engineer',
      'Software Engineer',
    ],
  },
  'team-roles': {
    key: 'teamRoles',
    writePermission: 'teams.write',
    standard: ['Lead', 'Member', 'Reviewer'],
  },
} as const;

export type PicklistKind = keyof typeof PICKLISTS;

export function isPicklistKind(value: string): value is PicklistKind {
  return Object.prototype.hasOwnProperty.call(PICKLISTS, value);
}

/**
 * One entry as stored: the company's own, or a standard one it archived. `removed` is a standard
 * name the company renamed or deleted: it stays out of the list, and adding it again brings it back.
 */
export type StoredEntry = { name: string; archived: boolean; standard: boolean; removed?: boolean };

type Metadata = Prisma.JsonObject;
const asMetadata = (value: unknown): Metadata =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** Collapses spaces and trims; the stored spelling is the first one added. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Reads the company's copy of one list: standard entries plus its own, with archived flags. */
export function readEntries(metadata: unknown, kind: PicklistKind): StoredEntry[] {
  const list = PICKLISTS[kind];
  const data = asMetadata(metadata);
  const names = (key: string) =>
    Array.isArray(data[key])
      ? (data[key] as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
  const retired = names(`${list.key}Archived`);
  const removed = names(`${list.key}Removed`);
  // Entries were once stored as plain names; both shapes are read.
  const own = (Array.isArray(data[list.key]) ? (data[list.key] as unknown[]) : []).flatMap(
    (item): StoredEntry[] => {
      if (typeof item === 'string') return [{ name: item, archived: false, standard: false }];
      if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string')
        return [
          {
            name: (item as { name: string }).name,
            archived: Boolean((item as { archived?: unknown }).archived),
            standard: false,
          },
        ];
      return [];
    },
  );
  return [
    ...list.standard.map((name) => ({
      name,
      archived: retired.some((r) => same(r, name)),
      standard: true,
      removed: removed.some((r) => same(r, name)),
    })),
    ...own.filter((entry) => !list.standard.some((s) => same(s, entry.name))),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/** The metadata after replacing one list's entries. */
export function writeEntries(metadata: unknown, kind: PicklistKind, entries: StoredEntry[]) {
  const list = PICKLISTS[kind];
  return {
    ...asMetadata(metadata),
    [list.key]: entries
      .filter((e) => !e.standard)
      .map((e) => (e.archived ? { name: e.name, archived: true } : { name: e.name })),
    [`${list.key}Archived`]: entries.filter((e) => e.standard && e.archived).map((e) => e.name),
    [`${list.key}Removed`]: entries.filter((e) => e.standard && e.removed).map((e) => e.name),
  } satisfies Prisma.InputJsonObject;
}

/**
 * Locks the organization's settings row for the rest of the transaction and returns its metadata,
 * so two changes to the lists at once are applied one after the other, never lost.
 */
export async function lockSettings(tx: TenantTransaction, organizationId: string) {
  await tx.organizationSettings.upsert({
    where: { organizationId },
    create: { organizationId, metadata: {} },
    update: {},
  });
  await tx.$queryRaw`SELECT organization_id FROM organization_settings WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  const settings = await tx.organizationSettings.findUniqueOrThrow({
    where: { organizationId },
    select: { metadata: true },
  });
  return settings.metadata;
}

/**
 * The name to store for a value used on a record (a project role on an assignment, say): the
 * list's own spelling when it exists, a new entry when it does not. So a role typed into Quick Add
 * is saved even when the form is submitted before the Add request finishes. An archived value is
 * refused: retired names are not given to new records.
 */
export async function ensureEntry(
  tx: TenantTransaction,
  context: DomainContext,
  kind: PicklistKind,
  raw: string | null | undefined,
): Promise<string | null> {
  if (raw === null || raw === undefined) return null;
  const name = normalizeName(raw);
  if (!name) return null;
  if (name.length < 2 || name.length > 80)
    throw new ConflictError('Names must be between 2 and 80 characters.');
  const metadata = await lockSettings(tx, context.organizationId);
  const entries = readEntries(metadata, kind);
  const existing = entries.find((entry) => same(entry.name, name) && !entry.removed);
  if (existing?.archived)
    throw new ConflictError(`"${existing.name}" is archived. Restore it before using it again.`);
  if (existing) return existing.name;
  if (!context.permissions.has(PICKLISTS[kind].writePermission) && !context.permissions.has('*'))
    throw new ConflictError(`"${name}" is not in the list.`);
  await tx.organizationSettings.update({
    where: { organizationId: context.organizationId },
    data: {
      metadata: writeEntries(
        metadata,
        kind,
        // A standard name the company had removed comes back; anything else is added as its own.
        entries.some((entry) => entry.removed && same(entry.name, name))
          ? entries.map((entry) => (same(entry.name, name) ? { ...entry, removed: false } : entry))
          : [...entries, { name, archived: false, standard: false }],
      ),
    },
  });
  return name;
}
