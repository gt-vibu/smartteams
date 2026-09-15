import { Injectable } from '@nestjs/common';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import type {
  HolidayQueryDto,
  HolidaySelectionsQueryDto,
  UpdateHolidaySettingsDto,
  UpsertEmployeeHolidayPolicyDto,
} from './holidays.dto';

/**
 * Holiday management.
 *
 * Provides administration for organization & branch holidays, allowance configuration,
 * and listing employee optional holiday selections.
 */

type HolidayInput = {
  name: string;
  holidayDate: string;
  branchId?: string;
  isOptional?: boolean;
};

@Injectable()
export class HolidaysService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Holidays for the tenant, optionally bounded by date, optional flag, or branch.
   */
  async list(context: DomainContext, filters: HolidayQueryDto = {}) {
    requirePermission(context, 'organizations.read');
    const from = filters.from ? dateOnly(filters.from) : undefined;
    const to = filters.to ? dateOnly(filters.to) : undefined;
    if (from && to && to < from)
      throw new ConflictError('Holiday range end must not precede start');
    return this.database.run(context, async (tx) => {
      const targetBranchId = context.branchId ?? filters.branchId;
      const holidays = await tx.holiday.findMany({
        where: {
          organizationId: context.organizationId,
          ...(from || to ? { holidayDate: { gte: from, lte: to } } : {}),
          ...(filters.isOptional !== undefined ? { isOptional: filters.isOptional } : {}),
          ...(targetBranchId ? { OR: [{ branchId: targetBranchId }, { branchId: null }] } : {}),
        },
        orderBy: [{ holidayDate: 'asc' }, { name: 'asc' }],
        take: 500,
      });
      return holidays.map(toHolidayDto);
    });
  }

  async create(context: DomainContext, input: HolidayInput) {
    requirePermission(context, 'organizations.update');
    const holidayDate = dateOnly(input.holidayDate);
    if (!input.name.trim()) throw new ConflictError('A holiday requires a name');
    const branchId = context.branchId ?? input.branchId;
    return this.database.run(context, async (tx) => {
      if (
        branchId &&
        !(await tx.branch.findFirst({
          where: { id: branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const existing = await tx.holiday.findFirst({
        where: {
          organizationId: context.organizationId,
          branchId: branchId ?? null,
          holidayDate,
        },
      });
      if (existing) throw new ConflictError('A holiday already exists on that date for this scope');
      const holiday = await tx.holiday.create({
        data: {
          organizationId: context.organizationId,
          branchId: branchId ?? null,
          holidayDate,
          name: input.name.trim(),
          isOptional: input.isOptional ?? false,
          sourceAccessMode: context.accessMode,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'HOLIDAY',
          entityId: holiday.id,
          action: 'HOLIDAY_CREATED',
          afterState: jsonSnapshot(holiday),
        },
        tx,
      );
      return toHolidayDto(holiday);
    });
  }

  /**
   * Renames a holiday or changes whether it is optional.
   */
  async update(
    context: DomainContext,
    holidayId: string,
    input: { name?: string; isOptional?: boolean },
  ) {
    requirePermission(context, 'organizations.update');
    return this.database.run(context, async (tx) => {
      const before = await tx.holiday.findFirst({
        where: { id: holidayId, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Holiday');
      if (input.name !== undefined && !input.name.trim())
        throw new ConflictError('A holiday requires a name');
      const holiday = await tx.holiday.update({
        where: { id: before.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.isOptional !== undefined ? { isOptional: input.isOptional } : {}),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'HOLIDAY',
          entityId: holiday.id,
          action: 'HOLIDAY_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(holiday),
        },
        tx,
      );
      return toHolidayDto(holiday);
    });
  }

  /**
   * Retires a holiday.
   */
  async deactivate(context: DomainContext, holidayId: string, reason: string) {
    requirePermission(context, 'organizations.update');
    requireReason({ ...context, reason }, 'Retiring a holiday requires a reason');
    return this.database.run(context, async (tx) => {
      const before = await tx.holiday.findFirst({
        where: { id: holidayId, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Holiday');
      if (!before.isActive) throw new ConflictError('Holiday is already retired');
      const holiday = await tx.holiday.update({
        where: { id: before.id },
        data: { isActive: false },
      });
      await this.audit.record(
        context,
        {
          entityType: 'HOLIDAY',
          entityId: holiday.id,
          action: 'HOLIDAY_DEACTIVATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(holiday),
          reason,
        },
        tx,
      );
      return toHolidayDto(holiday);
    });
  }

  /**
   * Reads organization holiday settings (such as annual optional holiday allowance).
   */
  async getSettings(context: DomainContext) {
    requirePermission(context, 'organizations.read');
    return this.database.run(context, async (tx) => {
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      return {
        organizationId: settings.organizationId,
        optionalHolidayAllowance: settings.optionalHolidayAllowance,
      };
    });
  }

  /**
   * Updates organization holiday settings.
   */
  async updateSettings(context: DomainContext, input: UpdateHolidaySettingsDto) {
    requirePermission(context, 'organizations.update');
    return this.database.run(context, async (tx) => {
      const before = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      const settings = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: {
          optionalHolidayAllowance: input.optionalHolidayAllowance,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'HOLIDAY_SETTINGS_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(settings),
        },
        tx,
      );
      return {
        organizationId: settings.organizationId,
        optionalHolidayAllowance: settings.optionalHolidayAllowance,
      };
    });
  }

  /**
   * Lists employee optional holiday selections for administrators.
   */
  async listSelections(context: DomainContext, query: HolidaySelectionsQueryDto = {}) {
    requirePermission(context, 'organizations.read');
    return this.database.run(context, async (tx) => {
      const selections = await tx.employeeHolidaySelection.findMany({
        where: {
          organizationId: context.organizationId,
          ...(query.year ? { year: query.year } : {}),
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          ...(query.branchId ? { employee: { primaryBranchId: query.branchId } } : {}),
        },
        include: {
          holiday: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              workEmail: true,
              primaryBranchId: true,
            },
          },
        },
        orderBy: [{ selectedAt: 'desc' }, { id: 'desc' }],
        take: 500,
      });

      return selections.map((s) => ({
        id: s.id,
        organizationId: s.organizationId,
        employeeId: s.employeeId,
        holidayId: s.holidayId,
        year: s.year,
        status: s.status,
        selectedAt: s.selectedAt.toISOString(),
        cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
        holiday: toHolidayDto(s.holiday),
        employee: s.employee,
      }));
    });
  }

  // ─── Per-employee holiday policy ──────────────────────────────────────────

  /**
   * Returns all employees in this org that have a per-employee holiday policy override.
   */
  async listEmployeePolicies(context: DomainContext) {
    requirePermission(context, 'organizations.read');
    return this.database.run(context, async (tx) => {
      const policies = await tx.employeeHolidayPolicy.findMany({
        where: { organizationId: context.organizationId },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              workEmail: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      return policies.map(toEmployeePolicyDto);
    });
  }

  /**
   * Reads the per-employee holiday policy for one employee.
   * Returns null when no override exists.
   */
  async getEmployeePolicy(context: DomainContext, employeeId: string) {
    requirePermission(context, 'organizations.read');
    return this.database.run(context, async (tx) => {
      const policy = await tx.employeeHolidayPolicy.findFirst({
        where: { employeeId, organizationId: context.organizationId },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              workEmail: true,
            },
          },
        },
      });
      return policy ? toEmployeePolicyDto(policy) : null;
    });
  }

  /**
   * Creates or fully replaces the per-employee holiday policy for one employee.
   *
   * Passing `allowanceOverride: null` clears the override so the employee falls back to the
   * global org allowance. Passing an empty `restrictedHolidayIds` array means the employee
   * sees the full org/branch optional pool.
   */
  async upsertEmployeePolicy(
    context: DomainContext,
    employeeId: string,
    input: UpsertEmployeeHolidayPolicyDto,
  ) {
    requirePermission(context, 'organizations.update');
    return this.database.run(context, async (tx) => {
      // Validate that the employee belongs to this org
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
      });
      if (!employee) throw new NotFoundError('Employee');

      const before = await tx.employeeHolidayPolicy.findFirst({
        where: { employeeId, organizationId: context.organizationId },
      });

      const policy = await tx.employeeHolidayPolicy.upsert({
        where: { employeeId },
        create: {
          organizationId: context.organizationId,
          employeeId,
          allowanceOverride: input.allowanceOverride ?? null,
          restrictedHolidayIds: input.restrictedHolidayIds,
        },
        update: {
          allowanceOverride: input.allowanceOverride ?? null,
          restrictedHolidayIds: input.restrictedHolidayIds,
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              workEmail: true,
            },
          },
        },
      });

      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_HOLIDAY_POLICY',
          entityId: policy.id,
          action: before ? 'EMPLOYEE_HOLIDAY_POLICY_UPDATED' : 'EMPLOYEE_HOLIDAY_POLICY_CREATED',
          beforeState: before ? jsonSnapshot(before) : undefined,
          afterState: jsonSnapshot(policy),
        },
        tx,
      );

      return toEmployeePolicyDto(policy);
    });
  }

  /**
   * Removes a per-employee holiday policy so the employee reverts to global defaults.
   */
  async deleteEmployeePolicy(context: DomainContext, employeeId: string) {
    requirePermission(context, 'organizations.update');
    return this.database.run(context, async (tx) => {
      const policy = await tx.employeeHolidayPolicy.findFirst({
        where: { employeeId, organizationId: context.organizationId },
      });
      if (!policy) throw new NotFoundError('Employee holiday policy');

      await tx.employeeHolidayPolicy.delete({ where: { id: policy.id } });

      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_HOLIDAY_POLICY',
          entityId: policy.id,
          action: 'EMPLOYEE_HOLIDAY_POLICY_DELETED',
          beforeState: jsonSnapshot(policy),
        },
        tx,
      );

      return { deleted: true };
    });
  }
}

/** Matches the date handling the rest of the backend uses for `@db.Date` columns. */
export function dateOnly(value: string) {
  const dateValue = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new ConflictError('Invalid calendar date');
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new ConflictError('Invalid calendar date');
  return date;
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

function toEmployeePolicyDto(policy: {
  id: string;
  organizationId: string;
  employeeId: string;
  allowanceOverride: number | null;
  restrictedHolidayIds: string[];
  createdAt: Date;
  updatedAt: Date;
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    workEmail: string | null;
  };
}) {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    employeeId: policy.employeeId,
    allowanceOverride: policy.allowanceOverride,
    restrictedHolidayIds: policy.restrictedHolidayIds,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
    employee: policy.employee,
  };
}
