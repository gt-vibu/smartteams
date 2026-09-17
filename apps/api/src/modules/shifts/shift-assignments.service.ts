import { Injectable } from '@nestjs/common';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { workDateInTimeZone } from '../attendance/attendance-shared';
import {
  assertMayReadEmployee,
  canReadAllEmployees,
  findSelfEmployeeId,
  selfOnlyError,
} from '../employees/employee-access';
import { toShiftDto } from './shifts.service';

export type AssignmentState = 'CURRENT' | 'UPCOMING' | 'ENDED';

const dateOnly = (key: string) => new Date(`${key}T00:00:00.000Z`);
const key = (date: Date) => date.toISOString().slice(0, 10);

/** Where an assignment stands on the tenant's `today`. */
export function assignmentState(
  assignment: { startsOn: Date; endsOn: Date | null },
  today: string,
): AssignmentState {
  if (key(assignment.startsOn) > today) return 'UPCOMING';
  if (assignment.endsOn && key(assignment.endsOn) < today) return 'ENDED';
  return 'CURRENT';
}

/**
 * Reading and ending employee shift assignments.
 *
 * Assignments could be created but never read back or ended: nothing listed who worked a shift,
 * and moving someone to another shift was impossible because the old open-ended assignment could
 * not be closed and the new one overlapped it. Native only — the federation shift routes are
 * separate and unchanged.
 */
@Injectable()
export class ShiftAssignmentsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** The shift an employee is assigned to on a day — their own unless they may read others. */
  async current(context: DomainContext, filters: { employeeId?: string; on?: string }) {
    requirePermission(context, 'shifts.read');
    return this.database.run(context, async (tx) => {
      const on = dateOnly(filters.on ?? (await tenantToday(tx, context.organizationId)));
      if (Number.isNaN(on.getTime())) throw new ConflictError('The date is invalid');
      const employeeId = filters.employeeId ?? (await findSelfEmployeeId(tx, context));
      if (!employeeId) return { assignment: null };
      // A colleague's shift is refused like any other self-scoped read.
      await assertMayReadEmployee(tx, context, employeeId);
      const assignment = await tx.employeeShiftAssignment.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId,
          startsOn: { lte: on },
          OR: [{ endsOn: null }, { endsOn: { gte: on } }],
          shift: { isActive: true },
        },
        include: { shift: { include: { breakRules: { orderBy: { sequence: 'asc' } } } } },
        orderBy: { startsOn: 'desc' },
      });
      if (!assignment) return { assignment: null };
      return {
        assignment: {
          id: assignment.id,
          employeeId: assignment.employeeId,
          startsOn: key(assignment.startsOn),
          endsOn: assignment.endsOn ? key(assignment.endsOn) : null,
          shift: toShiftDto(assignment.shift),
        },
      };
    });
  }

  /**
   * Who is on which shift. Current and upcoming assignments unless `includeEnded`; newest first,
   * a page at a time. A caller who may not read every employee sees only their own.
   */
  async list(
    context: DomainContext,
    filters: {
      shiftId?: string;
      employeeId?: string;
      includeEnded?: boolean;
      cursor?: string;
      limit?: number;
    },
  ) {
    requirePermission(context, 'shifts.read');
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    return this.database.run(context, async (tx) => {
      let employeeId = filters.employeeId;
      if (!canReadAllEmployees(context)) {
        const self = await findSelfEmployeeId(tx, context);
        if (!self) return { items: [], nextCursor: null };
        if (employeeId && employeeId !== self) throw selfOnlyError();
        employeeId = self;
      }
      const today = await tenantToday(tx, context.organizationId);
      const rows = await tx.employeeShiftAssignment.findMany({
        where: {
          organizationId: context.organizationId,
          ...(filters.shiftId ? { shiftId: filters.shiftId } : {}),
          ...(employeeId ? { employeeId } : {}),
          ...(context.branchId ? { branchId: context.branchId } : {}),
          ...(filters.includeEnded
            ? {}
            : { OR: [{ endsOn: null }, { endsOn: { gte: dateOnly(today) } }] }),
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
          shift: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ startsOn: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((row) => ({
          id: row.id,
          employee: row.employee,
          shift: row.shift,
          startsOn: key(row.startsOn),
          endsOn: row.endsOn ? key(row.endsOn) : null,
          state: assignmentState(row, today),
        })),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  /**
   * Ends an assignment on `endsOn`, the employee's last day on the shift.
   *
   * Only ever brings the end forward: extending one could overlap a later assignment, which the
   * create path refuses, and that check belongs there. Audited with the reason. Like retiring a
   * shift — which already ends its open assignments — this publishes no federation event.
   */
  async end(
    context: DomainContext,
    assignmentId: string,
    input: { endsOn: string; reason: string },
  ) {
    requirePermission(context, 'shifts.write');
    requireReason(
      { ...context, reason: input.reason },
      'Ending a shift assignment requires a reason',
    );
    const endsOn = dateOnly(input.endsOn);
    if (Number.isNaN(endsOn.getTime())) throw new ConflictError('The end date is invalid');
    return this.database.run(context, async (tx) => {
      // Locked, so two administrators ending it at once cannot both pass the checks below.
      await tx.$queryRaw`SELECT id FROM employee_shift_assignments WHERE id = ${assignmentId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const before = await tx.employeeShiftAssignment.findFirst({
        where: {
          id: assignmentId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
      });
      if (!before) throw new NotFoundError('Shift assignment');
      if (endsOn < before.startsOn)
        throw new ConflictError('The last day cannot be before the assignment starts');
      if (before.endsOn && endsOn >= before.endsOn)
        throw new ConflictError(
          `This assignment already ends on ${key(before.endsOn)}; it can only be ended earlier`,
        );
      const updated = await tx.employeeShiftAssignment.update({
        where: { id: before.id },
        data: { endsOn },
      });
      await this.audit.record(
        { ...context, reason: input.reason },
        {
          entityType: 'EMPLOYEE_SHIFT_ASSIGNMENT',
          entityId: updated.id,
          action: 'SHIFT_ASSIGNMENT_ENDED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
          reason: input.reason,
        },
        tx,
      );
      return {
        id: updated.id,
        startsOn: key(updated.startsOn),
        endsOn: key(endsOn),
        state: assignmentState(updated, await tenantToday(tx, context.organizationId)),
      };
    });
  }
}

/** Today's date in the organization's own timezone, as `YYYY-MM-DD`. */
async function tenantToday(tx: Prisma.TransactionClient, organizationId: string) {
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return workDateInTimeZone(new Date(), organization?.timezone ?? 'UTC');
}
