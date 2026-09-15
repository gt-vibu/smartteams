import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { assertMayReadEmployee, findSelfEmployeeId } from '../employees/employee-access';
import { toShiftDto } from './shifts.service';

/**
 * The shift an employee is assigned to on a given day.
 *
 * Assignments could be written but never read back: Home's Work Schedule card had nothing to ask,
 * so it always said "Not recorded" even for an employee with a shift. Read-only and native only —
 * the federation shift routes are separate and unchanged.
 */
@Injectable()
export class ShiftAssignmentLookupService {
  constructor(private readonly database: TenantDatabaseService) {}

  async current(context: DomainContext, filters: { employeeId?: string; on?: string }) {
    requirePermission(context, 'shifts.read');
    const on = filters.on ? new Date(`${filters.on}T00:00:00.000Z`) : startOfTodayUtc();
    if (Number.isNaN(on.getTime())) throw new ConflictError('The date is invalid');
    return this.database.run(context, async (tx) => {
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
          startsOn: assignment.startsOn.toISOString().slice(0, 10),
          endsOn: assignment.endsOn?.toISOString().slice(0, 10) ?? null,
          shift: toShiftDto(assignment.shift),
        },
      };
    });
  }
}

function startOfTodayUtc() {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}
