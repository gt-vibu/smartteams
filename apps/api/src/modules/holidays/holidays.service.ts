import { Injectable } from '@nestjs/common';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

/**
 * Holiday management.
 *
 * The `Holiday` model, its constraints and its consumers all existed before this service: leave
 * excludes an active holiday from the working days it charges a request for, and payroll counts
 * them into `periodWorkingDays`. What was missing was any way for a tenant to enter one — the
 * rows could only arrive through a federated sync or a seed.
 *
 * This is deliberately the smallest surface that makes the existing capability usable: list,
 * create, rename, and deactivate. Nothing here extends the domain — no holiday categories, no
 * regional calendars, no carry-forward — because the model has no such fields.
 *
 * Permissions reuse the organization boundary rather than inventing a parallel one: a holiday is
 * organization (and optionally branch) configuration, so reading needs `organizations.read` and
 * changing needs `organizations.update`.
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
   * Holidays for the tenant, optionally bounded by date.
   *
   * Inactive holidays are included so an administrator can see what was retired; leave and
   * payroll both filter to `isActive` themselves.
   */
  async list(context: DomainContext, filters: { from?: string; to?: string } = {}) {
    requirePermission(context, 'organizations.read');
    const from = filters.from ? dateOnly(filters.from) : undefined;
    const to = filters.to ? dateOnly(filters.to) : undefined;
    if (from && to && to < from)
      throw new ConflictError('Holiday range end must not precede start');
    return this.database.run(context, async (tx) => {
      const holidays = await tx.holiday.findMany({
        where: {
          organizationId: context.organizationId,
          ...(from || to ? { holidayDate: { gte: from, lte: to } } : {}),
          // A federated branch context sees its own branch's holidays and the organization-wide
          // ones, matching how leave resolves them for an employee.
          ...(context.branchId ? { OR: [{ branchId: context.branchId }, { branchId: null }] } : {}),
        },
        orderBy: [{ holidayDate: 'asc' }, { name: 'asc' }],
        // Two years of holidays for an organization and its branches sits far inside this.
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
      // `@@unique([organizationId, branchId, holidayDate])` already prevents two holidays on the
      // same date for the same scope; this turns that into an actionable conflict rather than a
      // driver error.
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
   *
   * The date and branch are not editable: both are part of the uniqueness key, and moving a
   * holiday silently changes what past leave requests were charged. Retire it and add a new one.
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
   *
   * Deactivation rather than deletion, because leave requests already charged against this date
   * keep their recorded day counts — the row stays as the record of why. Future calculations stop
   * seeing it; nothing already persisted is recomputed.
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

/**
 * The holiday response shape.
 *
 * This route returned the Prisma row, so `sourceAccessMode`, `externalId`, `createdAt` and
 * `updatedAt` all reached the browser and the frontend's schema was written from whatever
 * happened to be there. A holiday is a date, a name and an optional branch scope.
 */
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
    // A `@db.Date` column has no meaningful time; sending one invites a timezone bug on a value
    // that leave and payroll both count days against.
    holidayDate: holiday.holidayDate.toISOString().slice(0, 10),
    name: holiday.name,
    isOptional: holiday.isOptional,
    isActive: holiday.isActive,
  };
}
