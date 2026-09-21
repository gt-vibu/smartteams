import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';

/**
 * The rules one employee's branch memberships obey, shared by every operation that changes them.
 *
 *   - Exactly one primary branch at any date, from joining until leaving. A transfer ends the old
 *     primary the day before the new one starts; nothing is overwritten, so "was at Koramangala
 *     until January" stays on record.
 *   - Any number of additional branches, each with its own dates, never two overlapping rows for
 *     the same branch.
 *   - `employees.primary_branch_id` is the primary for *today*. Everything else in the product
 *     reads it, so it moves on the day a transfer takes effect — immediately for a transfer dated
 *     today or earlier, and by the scheduled sweep for one dated in the future.
 */

export const DAY_MS = 86_400_000;

/** A calendar date, as the UTC midnight the database's `date` columns round-trip to. */
export function calendarDate(value: string | Date): Date {
  const text = typeof value === 'string' ? value : value.toISOString();
  const date = new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ConflictError(`${text} is not a valid date`);
  return date;
}

export const dayBefore = (date: Date) => new Date(date.getTime() - DAY_MS);
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Today in the organization's own timezone: a transfer "from 1 October" means its 1 October. */
export async function organizationToday(tx: TenantTransaction, organizationId: string) {
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return todayIn(organization?.timezone ?? 'UTC');
}

export function todayIn(timezone: string, now = new Date()) {
  let key: string;
  try {
    key = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  } catch {
    key = now.toISOString().slice(0, 10);
  }
  return calendarDate(key);
}

export type MembershipRow = {
  id: string;
  branchId: string;
  isPrimary: boolean;
  startsOn: Date;
  endsOn: Date | null;
};

/** Where a membership stands on `today`: running, not begun yet, or over. */
export function membershipState(row: Pick<MembershipRow, 'startsOn' | 'endsOn'>, today: Date) {
  if (row.startsOn > today) return 'UPCOMING' as const;
  if (row.endsOn && row.endsOn < today) return 'ENDED' as const;
  return 'ACTIVE' as const;
}

/** Whether two date ranges share a day. An open end runs for ever. */
export function overlaps(
  a: Pick<MembershipRow, 'startsOn' | 'endsOn'>,
  b: Pick<MembershipRow, 'startsOn' | 'endsOn'>,
) {
  const aEnd = a.endsOn?.getTime() ?? Infinity;
  const bEnd = b.endsOn?.getTime() ?? Infinity;
  return a.startsOn.getTime() <= bEnd && b.startsOn.getTime() <= aEnd;
}

/** The employee a membership change is for: in this organization, and still employed. */
export async function activeEmployee(
  tx: TenantTransaction,
  organizationId: string,
  employeeId: string,
) {
  const employee = await tx.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      primaryBranchId: true,
      dateOfJoining: true,
    },
  });
  if (!employee) throw new NotFoundError('Employee');
  if (employee.status !== 'ACTIVE')
    throw new ConflictError(
      `${employee.firstName} ${employee.lastName} is no longer active, so their branches cannot change.`,
    );
  return employee;
}

/** A branch that can take people: in this organization and not deactivated. */
export async function openBranch(tx: TenantTransaction, organizationId: string, branchId: string) {
  const branch = await tx.branch.findFirst({
    where: { id: branchId, organizationId },
    select: { id: true, name: true, status: true },
  });
  if (!branch) throw new NotFoundError('Branch');
  if (branch.status !== 'ACTIVE')
    throw new ConflictError(`${branch.name} is deactivated, so nobody can be assigned to it.`);
  return branch;
}

/** A membership cannot begin before the person joined. */
export function assertAfterJoining(
  employee: { dateOfJoining: Date | null; firstName: string },
  startsOn: Date,
) {
  if (employee.dateOfJoining && startsOn < calendarDate(employee.dateOfJoining))
    throw new ConflictError(
      `${employee.firstName} joined on ${isoDay(employee.dateOfJoining)}; a branch cannot start before that.`,
    );
}

/**
 * Makes sure the primary branch the employee record names has a membership row behind it.
 *
 * Onboarding sets `primary_branch_id` without writing the history row, so most employees have a
 * primary branch and no record of when it began. The row is written the first time their branches
 * change, from their joining date — or, if a row for that branch already covers today, that row
 * is marked primary instead, since two rows for one branch may not overlap.
 */
export async function ensurePrimaryRow(
  tx: TenantTransaction,
  organizationId: string,
  employee: { id: string; primaryBranchId: string | null; dateOfJoining: Date | null },
  today: Date,
  sourceAccessMode: DomainContext['accessMode'],
  /** Off when leaving: an upcoming row that blocks the backfill is removed by the leaving anyway. */
  strict = true,
) {
  const rows = await memberships(tx, organizationId, employee.id);
  if (rows.some((row) => row.isPrimary) || !employee.primaryBranchId) return rows;
  const covering = rows.find(
    (row) => row.branchId === employee.primaryBranchId && membershipState(row, today) === 'ACTIVE',
  );
  if (covering) {
    await tx.employeeBranchAssignment.update({
      where: { id: covering.id },
      data: { isPrimary: true },
    });
  } else {
    // From joining — or from the day after the latest earlier stint at the same branch, since two
    // rows for one branch may not overlap. An upcoming row there cannot be stepped around.
    let startsOn = employee.dateOfJoining ? calendarDate(employee.dateOfJoining) : today;
    for (const row of rows) {
      if (row.branchId !== employee.primaryBranchId || !overlaps(row, { startsOn, endsOn: null }))
        continue;
      if (!row.endsOn || row.endsOn >= today) {
        if (!strict) return rows;
        throw new ConflictError(
          'An upcoming membership at the primary branch must be cancelled before branches can change.',
        );
      }
      startsOn = new Date(row.endsOn.getTime() + DAY_MS);
    }
    await tx.employeeBranchAssignment.create({
      data: {
        organizationId,
        employeeId: employee.id,
        branchId: employee.primaryBranchId,
        isPrimary: true,
        startsOn,
        sourceAccessMode,
      },
    });
  }
  return memberships(tx, organizationId, employee.id);
}

export function memberships(tx: TenantTransaction, organizationId: string, employeeId: string) {
  return tx.employeeBranchAssignment.findMany({
    where: { organizationId, employeeId },
    orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, branchId: true, isPrimary: true, startsOn: true, endsOn: true },
  });
}

/**
 * Points `primary_branch_id` at the primary membership that covers `today`, if it has moved.
 * Returns whether it changed, so callers can say so.
 */
export async function syncPrimaryBranch(
  tx: TenantTransaction,
  organizationId: string,
  employeeId: string,
  today: Date,
) {
  const current = await tx.employeeBranchAssignment.findFirst({
    where: {
      organizationId,
      employeeId,
      isPrimary: true,
      startsOn: { lte: today },
      OR: [{ endsOn: null }, { endsOn: { gte: today } }],
    },
    select: { branchId: true },
  });
  if (!current) return false;
  const moved = await tx.employee.updateMany({
    where: {
      id: employeeId,
      organizationId,
      // Written out rather than NOT(=): a null primary would never match NOT(null = id).
      OR: [{ primaryBranchId: null }, { primaryBranchId: { not: current.branchId } }],
    },
    data: { primaryBranchId: current.branchId, version: { increment: 1 } },
  });
  return moved.count > 0;
}

/**
 * Whether a branch can be deactivated without leaving anyone behind.
 *
 * Refused while it is still the primary branch of anyone employed — now or from a scheduled
 * transfer — because everyone must have a primary branch, and while anyone is due to start there,
 * because a membership cannot end before it begins. Additional memberships simply end.
 */
export async function assertBranchCanClose(
  tx: TenantTransaction,
  organizationId: string,
  branch: { id: string; name: string },
  today: Date,
) {
  const anchored = await tx.employee.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      OR: [
        { primaryBranchId: branch.id },
        { branchAssignments: { some: { branchId: branch.id, isPrimary: true, endsOn: null } } },
      ],
    },
    select: { firstName: true, lastName: true },
    take: 4,
  });
  if (anchored.length)
    throw new ConflictError(
      `${branch.name} is still the primary branch of ${names(anchored)}. Transfer them to another branch first.`,
    );
  const upcoming = await tx.employeeBranchAssignment.findMany({
    where: { organizationId, branchId: branch.id, startsOn: { gt: today } },
    select: { employee: { select: { firstName: true, lastName: true } } },
    take: 4,
  });
  if (upcoming.length)
    throw new ConflictError(
      `${names(upcoming.map((row) => row.employee))} ${upcoming.length === 1 ? 'is' : 'are'} due to start at ${branch.name}. Cancel that first.`,
    );
}

function names(people: Array<{ firstName: string; lastName: string }>) {
  const shown = people.slice(0, 3).map((person) => `${person.firstName} ${person.lastName}`);
  return people.length > 3 ? `${shown.join(', ')} and others` : shown.join(', ');
}
