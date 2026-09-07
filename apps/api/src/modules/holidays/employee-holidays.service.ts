import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';

/**
 * Employee self-service for optional / floating holiday selection.
 *
 * An optional holiday is not an arbitrary leave request: the organization publishes a defined
 * pool of optional holidays, and eligible employees select up to their configured annual allowance.
 *
 * The selected holidays form each employee's effective holiday calendar.
 *
 * Allowance resolution (tiered):
 *  1. EmployeeHolidayPolicy.allowanceOverride (if a row exists and override is non-null)
 *  2. OrganizationSettings.optionalHolidayAllowance (global default)
 *
 * Pool resolution (tiered):
 *  1. EmployeeHolidayPolicy.restrictedHolidayIds (if non-empty, only those IDs are in pool)
 *  2. Full org/branch optional holiday pool
 */
@Injectable()
export class EmployeeHolidaysService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Returns the employee's holiday overview for a calendar year:
   * mandatory holidays, available optional pool, configured allowance, and selected holidays.
   */
  async getMyHolidaySummary(context: DomainContext, requestedYear?: number) {
    requirePermission(context, 'organizations.read');
    const year = requestedYear ?? new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    return this.database.run(context, async (tx) => {
      const employee = await this.resolveSelfEmployee(tx, context);
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });

      // Load per-employee policy if any
      const employeePolicy = await tx.employeeHolidayPolicy.findFirst({
        where: { employeeId: employee.id, organizationId: context.organizationId },
      });

      // Tiered allowance resolution
      const allowance =
        employeePolicy?.allowanceOverride != null
          ? employeePolicy.allowanceOverride
          : settings.optionalHolidayAllowance;

      const branchId = employee.primaryBranchId;

      // Active holidays for this employee's branch/org scope in the year
      const allHolidays = await tx.holiday.findMany({
        where: {
          organizationId: context.organizationId,
          isActive: true,
          holidayDate: { gte: yearStart, lte: yearEnd },
          ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : { branchId: null }),
        },
        orderBy: [{ holidayDate: 'asc' }, { name: 'asc' }],
      });

      const mandatory = allHolidays.filter((h) => !h.isOptional).map(toHolidayDto);
      const fullOptionalPool = allHolidays.filter((h) => h.isOptional);

      // Tiered pool resolution: if employee has restricted holiday IDs, filter to them
      const restrictedIds =
        employeePolicy && employeePolicy.restrictedHolidayIds.length > 0
          ? new Set(employeePolicy.restrictedHolidayIds)
          : null;

      const optionalPool = (
        restrictedIds ? fullOptionalPool.filter((h) => restrictedIds.has(h.id)) : fullOptionalPool
      ).map(toHolidayDto);

      const selections = await tx.employeeHolidaySelection.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          year,
          status: 'CONFIRMED',
        },
        include: {
          holiday: true,
        },
        orderBy: { selectedAt: 'asc' },
      });

      const usedCount = selections.length;
      const remainingCount = Math.max(0, allowance - usedCount);

      return {
        year,
        allowance,
        usedCount,
        remainingCount,
        mandatory,
        optionalPool,
        selectedHolidayIds: selections.map((s) => s.holidayId),
        selections: selections.map((s) => ({
          id: s.id,
          organizationId: s.organizationId,
          employeeId: s.employeeId,
          holidayId: s.holidayId,
          year: s.year,
          status: s.status,
          selectedAt: s.selectedAt.toISOString(),
          cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
          holiday: toHolidayDto(s.holiday),
        })),
      };
    });
  }

  /**
   * Selects one or more optional holidays from the available pool.
   *
   * Validates in a single transaction:
   * - Total confirmed selections do not exceed annual allowance (tiered)
   * - Selected holidays are active, optional, in the employee's effective pool
   * - Holiday date is not in the past
   * - Concurrency safe against simultaneous selection requests
   */
  async selectHolidays(context: DomainContext, holidayIds: string[]) {
    requirePermission(context, 'organizations.read');
    if (!holidayIds.length) {
      throw new ConflictError('At least one holiday must be selected');
    }

    const uniqueHolidayIds = [...new Set(holidayIds)];

    return this.database.run(context, async (tx) => {
      const resolvedEmployee = await this.resolveSelfEmployee(tx, context);

      // Lock employee record for the duration of this transaction to prevent concurrent race conditions on allowance
      await tx.$queryRawUnsafe(
        `SELECT id FROM "employees" WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        resolvedEmployee.id,
        context.organizationId,
      );

      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: resolvedEmployee.id },
      });

      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });

      // Load per-employee policy if any
      const employeePolicy = await tx.employeeHolidayPolicy.findFirst({
        where: { employeeId: employee.id, organizationId: context.organizationId },
      });

      // Tiered allowance resolution
      const allowance =
        employeePolicy?.allowanceOverride != null
          ? employeePolicy.allowanceOverride
          : settings.optionalHolidayAllowance;

      if (allowance <= 0) {
        throw new ConflictError(
          'No optional holiday allowance has been configured for this employee',
        );
      }

      // Tiered pool resolution
      const restrictedIds =
        employeePolicy && employeePolicy.restrictedHolidayIds.length > 0
          ? new Set(employeePolicy.restrictedHolidayIds)
          : null;

      // Fetch requested holidays
      const holidays = await tx.holiday.findMany({
        where: {
          id: { in: uniqueHolidayIds },
          organizationId: context.organizationId,
          isActive: true,
        },
      });

      if (holidays.length !== uniqueHolidayIds.length) {
        throw new NotFoundError('One or more selected holidays could not be found or are inactive');
      }

      const today = new Date().toISOString().slice(0, 10);

      for (const h of holidays) {
        if (!h.isOptional) {
          throw new ConflictError(
            `'${h.name}' is already a mandatory holiday and cannot be selected`,
          );
        }
        if (h.branchId && h.branchId !== employee.primaryBranchId) {
          throw new ConflictError(`'${h.name}' is not applicable to your assigned branch`);
        }
        const holDateStr = h.holidayDate.toISOString().slice(0, 10);
        if (holDateStr < today) {
          throw new ConflictError(
            `Cannot select '${h.name}' because its date (${holDateStr}) has already passed`,
          );
        }
        // Pool restriction check
        if (restrictedIds && !restrictedIds.has(h.id)) {
          throw new ConflictError(`'${h.name}' is not in your assigned optional holiday pool`);
        }
      }

      // Target year derived from the selected holidays
      const firstHoliday = holidays[0];
      if (!firstHoliday) {
        throw new NotFoundError('Selected holidays');
      }
      const targetYear = firstHoliday.holidayDate.getUTCFullYear();
      for (const h of holidays) {
        if (h.holidayDate.getUTCFullYear() !== targetYear) {
          throw new ConflictError('All selected holidays must belong to the same calendar year');
        }
      }

      // Current confirmed selections for this employee in the target year
      const currentSelections = await tx.employeeHolidaySelection.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          year: targetYear,
          status: 'CONFIRMED',
        },
      });

      const currentSelectedIds = new Set(currentSelections.map((s) => s.holidayId));
      const newlySelectedIds = uniqueHolidayIds.filter((id) => !currentSelectedIds.has(id));

      if (currentSelections.length + newlySelectedIds.length > allowance) {
        throw new ConflictError(
          `Selection exceeds annual allowance (${allowance} allowed, ${currentSelections.length} already selected, ${newlySelectedIds.length} requested)`,
        );
      }

      // Upsert selections
      const results = [];
      for (const holiday of holidays) {
        const selection = await tx.employeeHolidaySelection.upsert({
          where: {
            employeeId_holidayId: {
              employeeId: employee.id,
              holidayId: holiday.id,
            },
          },
          create: {
            organizationId: context.organizationId,
            employeeId: employee.id,
            holidayId: holiday.id,
            year: targetYear,
            status: 'CONFIRMED',
            selectedAt: new Date(),
          },
          update: {
            status: 'CONFIRMED',
            cancelledAt: null,
            selectedAt: new Date(),
          },
        });
        results.push(selection);
      }

      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_HOLIDAY_SELECTION',
          entityId: employee.id,
          action: 'EMPLOYEE_HOLIDAY_SELECTED',
          afterState: jsonSnapshot({
            employeeId: employee.id,
            year: targetYear,
            selectedHolidayIds: uniqueHolidayIds,
          }),
        },
        tx,
      );

      await this.outbox.append(
        context,
        {
          aggregateType: 'EmployeeHolidaySelection',
          aggregateId: employee.id,
          aggregateVersion: 1,
          eventType: 'employee.holiday.selected',
          payload: jsonSnapshot({
            employeeId: employee.id,
            year: targetYear,
            selectedHolidayIds: uniqueHolidayIds,
          }),
        },
        tx,
      );

      return this.getMyHolidaySummary(context, targetYear);
    });
  }

  /**
   * Cancels a previously confirmed optional holiday selection.
   *
   * Validates that the holiday date has not already passed.
   */
  async cancelSelection(context: DomainContext, holidayId: string, reason?: string) {
    requirePermission(context, 'organizations.read');

    return this.database.run(context, async (tx) => {
      const resolvedEmployee = await this.resolveSelfEmployee(tx, context);

      // Lock employee record for the duration of this transaction
      await tx.$queryRawUnsafe(
        `SELECT id FROM "employees" WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        resolvedEmployee.id,
        context.organizationId,
      );

      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: resolvedEmployee.id },
      });

      const selection = await tx.employeeHolidaySelection.findUnique({
        where: {
          employeeId_holidayId: {
            employeeId: employee.id,
            holidayId,
          },
        },
        include: { holiday: true },
      });

      if (!selection || selection.organizationId !== context.organizationId) {
        throw new NotFoundError('Holiday selection');
      }

      if (selection.status !== 'CONFIRMED') {
        throw new ConflictError('Selection is not currently active');
      }

      const today = new Date().toISOString().slice(0, 10);
      const holidayDate = selection.holiday.holidayDate.toISOString().slice(0, 10);
      if (holidayDate < today) {
        throw new ConflictError('Cannot cancel an optional holiday that has already passed');
      }

      const updated = await tx.employeeHolidaySelection.update({
        where: { id: selection.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_HOLIDAY_SELECTION',
          entityId: selection.id,
          action: 'EMPLOYEE_HOLIDAY_CANCELLED',
          beforeState: jsonSnapshot(selection),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );

      await this.outbox.append(
        context,
        {
          aggregateType: 'EmployeeHolidaySelection',
          aggregateId: selection.id,
          aggregateVersion: 2,
          eventType: 'employee.holiday.cancelled',
          payload: jsonSnapshot({
            selectionId: selection.id,
            employeeId: employee.id,
            holidayId,
            reason,
          }),
        },
        tx,
      );

      return this.getMyHolidaySummary(context, selection.year);
    });
  }

  private async resolveSelfEmployee(tx: Prisma.TransactionClient, context: DomainContext) {
    if (!context.actor.userId) {
      throw new NotFoundError('Authenticated user identity');
    }
    const employee = await tx.employee.findFirst({
      where: {
        userId: context.actor.userId,
        organizationId: context.organizationId,
        status: 'ACTIVE',
      },
    });
    if (!employee) {
      throw new NotFoundError('Active employee record for user');
    }
    return employee;
  }
}

function toHolidayDto(holiday: {
  id: string;
  organizationId: string;
  branchId: string | null;
  holidayDate: Date;
  name: string;
  isOptional: boolean;
  isActive: boolean;
}) {
  return {
    id: holiday.id,
    organizationId: holiday.organizationId,
    branchId: holiday.branchId,
    holidayDate: holiday.holidayDate.toISOString().slice(0, 10),
    name: holiday.name,
    isOptional: holiday.isOptional,
    isActive: holiday.isActive,
  };
}
