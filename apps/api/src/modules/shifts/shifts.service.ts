import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';

type ShiftInput = {
  code: string;
  name: string;
  branchId?: string;
  daysOfWeek: number[];
  startsAt: string;
  endsAt: string;
  crossesMidnight: boolean;
  breakMinutes: number;
  breakRules?: Array<{ name: string; durationMinutes: number; isPaid: boolean; sequence: number }>;
};

@Injectable()
export class ShiftsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(context: DomainContext, input: ShiftInput) {
    requirePermission(context, 'shifts.write');
    validateDays(input.daysOfWeek);
    if (context.branchId && input.branchId && input.branchId !== context.branchId)
      throw new ConflictError('Shift branch does not match the federated branch scope');
    const branchId = context.branchId ?? input.branchId;
    return this.database.run(context, async (tx) => {
      if (
        branchId &&
        !(await tx.branch.findFirst({
          where: { id: branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const shift = await tx.shift.create({
        data: {
          organizationId: context.organizationId,
          branchId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          daysOfWeek: input.daysOfWeek,
          startsAt: timeOnly(input.startsAt),
          endsAt: timeOnly(input.endsAt),
          crossesMidnight: input.crossesMidnight,
          breakMinutes: input.breakMinutes,
          breakRules: input.breakRules ? { create: input.breakRules } : undefined,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'SHIFT',
          entityId: shift.id,
          action: 'SHIFT_CREATED',
          afterState: jsonSnapshot(shift),
        },
        tx,
      );
      return toShiftDto(shift);
    });
  }

  async list(context: DomainContext) {
    requirePermission(context, 'shifts.read');
    return this.database.run(context, (tx) =>
      tx.shift
        .findMany({
          where: {
            organizationId: context.organizationId,
            isActive: true,
            ...(context.branchId
              ? { OR: [{ branchId: context.branchId }, { branchId: null }] }
              : {}),
          },
          include: { breakRules: { orderBy: { sequence: 'asc' } } },
          orderBy: { code: 'asc' },
        })
        .then((shifts) => shifts.map(toShiftDto)),
    );
  }

  async update(context: DomainContext, shiftId: string, input: Partial<ShiftInput>) {
    requirePermission(context, 'shifts.write');
    if (input.daysOfWeek) validateDays(input.daysOfWeek);
    if (context.branchId && input.branchId && input.branchId !== context.branchId)
      throw new ConflictError('Shift branch does not match the federated branch scope');
    return this.database.run(context, async (tx) => {
      const before = await tx.shift.findFirst({
        where: {
          id: shiftId,
          organizationId: context.organizationId,
          isActive: true,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        include: { breakRules: { orderBy: { sequence: 'asc' } } },
      });
      if (!before) throw new NotFoundError('Shift');
      if (
        input.branchId !== undefined &&
        input.branchId &&
        !(await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const updated = await tx.shift.update({
        where: { id: before.id },
        data: {
          code: input.code?.trim().toUpperCase(),
          name: input.name?.trim(),
          branchId: input.branchId ?? undefined,
          daysOfWeek: input.daysOfWeek,
          startsAt: input.startsAt ? timeOnly(input.startsAt) : undefined,
          endsAt: input.endsAt ? timeOnly(input.endsAt) : undefined,
          crossesMidnight: input.crossesMidnight,
          breakMinutes: input.breakMinutes,
          breakRules: input.breakRules
            ? {
                deleteMany: {},
                create: input.breakRules,
              }
            : undefined,
        },
        include: { breakRules: { orderBy: { sequence: 'asc' } } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'SHIFT',
          entityId: updated.id,
          action: 'SHIFT_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return toShiftDto(updated);
    });
  }

  async deactivate(context: DomainContext, shiftId: string, reason: string) {
    requirePermission(context, 'shifts.write');
    if (!reason.trim()) throw new ConflictError('Shift deactivation requires a reason');
    return this.database.run(context, async (tx) => {
      const before = await tx.shift.findFirst({
        where: {
          id: shiftId,
          organizationId: context.organizationId,
          isActive: true,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
      });
      if (!before) throw new NotFoundError('Shift');
      const updated = await tx.shift.update({
        where: { id: before.id },
        data: { isActive: false },
      });
      await tx.employeeShiftAssignment.updateMany({
        where: { organizationId: context.organizationId, shiftId: before.id, endsOn: null },
        data: { endsOn: new Date() },
      });
      await this.audit.record(
        { ...context, reason },
        {
          entityType: 'SHIFT',
          entityId: updated.id,
          action: 'SHIFT_DEACTIVATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      return toShiftDto(updated);
    });
  }

  async assign(
    context: DomainContext,
    employeeId: string,
    input: { shiftId: string; branchId?: string; startsOn: string; endsOn?: string },
  ) {
    requirePermission(context, 'shifts.write');
    return this.database.run(context, async (tx) => {
      const start = dateOnly(input.startsOn);
      const end = input.endsOn ? dateOnly(input.endsOn) : undefined;
      if (end && end < start)
        throw new ConflictError('Shift assignment end must not precede start');
      const [employee, shift] = await Promise.all([
        tx.employee.findFirst({
          where: {
            id: employeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
            ...(context.branchId
              ? {
                  OR: [
                    { primaryBranchId: context.branchId },
                    { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
                  ],
                }
              : {}),
          },
        }),
        tx.shift.findFirst({
          where: {
            id: input.shiftId,
            organizationId: context.organizationId,
            isActive: true,
            ...(context.branchId ? { branchId: context.branchId } : {}),
          },
        }),
      ]);
      if (!employee) throw new NotFoundError('Employee');
      if (!shift) throw new NotFoundError('Shift');
      if (context.branchId && input.branchId && input.branchId !== context.branchId)
        throw new ConflictError(
          'Shift assignment branch does not match the federated branch scope',
        );
      const branchId = context.branchId ?? input.branchId;
      if (
        branchId &&
        !(await tx.branch.findFirst({
          where: { id: branchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const overlap = await tx.employeeShiftAssignment.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId,
          startsOn: { lte: end ?? new Date('9999-12-31') },
          OR: [{ endsOn: null }, { endsOn: { gte: start } }],
        },
      });
      if (overlap) throw new ConflictError('Employee shift assignments must not overlap');
      const assignment = await tx.employeeShiftAssignment.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          shiftId: input.shiftId,
          branchId,
          startsOn: start,
          endsOn: end,
          sourceAccessMode: context.accessMode,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_SHIFT_ASSIGNMENT',
          entityId: assignment.id,
          action: 'SHIFT_ASSIGNED',
          afterState: jsonSnapshot(assignment),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'EmployeeShiftAssignment',
          aggregateId: assignment.id,
          aggregateVersion: 1,
          eventType: 'shift.assignment.changed',
          payload: jsonSnapshot(assignment),
        },
        tx,
      );
      return {
        id: assignment.id,
        organizationId: assignment.organizationId,
        employeeId: assignment.employeeId,
        shiftId: assignment.shiftId,
        branchId: assignment.branchId,
        startsOn: assignment.startsOn,
        endsOn: assignment.endsOn,
      };
    });
  }
}

function dateOnly(value: string) {
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
function timeOnly(value: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59)
    throw new ConflictError('Invalid shift time');
  return new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2]), Number(match[3] ?? 0)));
}
function validateDays(days: number[]) {
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    throw new ConflictError('Shift days must be ISO weekdays from 1 to 7');
}

function toShiftDto(value: {
  id: string;
  organizationId: string;
  branchId: string | null;
  code: string;
  name: string;
  daysOfWeek: number[];
  startsAt: Date;
  endsAt: Date;
  crossesMidnight: boolean;
  breakMinutes: number;
  isActive: boolean;
  breakRules?: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    isPaid: boolean;
    sequence: number;
  }>;
}) {
  return {
    id: value.id,
    organizationId: value.organizationId,
    branchId: value.branchId,
    code: value.code,
    name: value.name,
    daysOfWeek: value.daysOfWeek,
    startsAt: formatTime(value.startsAt),
    endsAt: formatTime(value.endsAt),
    crossesMidnight: value.crossesMidnight,
    breakMinutes: value.breakMinutes,
    isActive: value.isActive,
    breakRules: value.breakRules?.map((rule) => ({ ...rule })),
  };
}

function formatTime(value: Date) {
  return [value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}
