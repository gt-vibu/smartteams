import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { approvalLocalDate } from '../approvals/approval-automation';
import { ShiftsService } from '../shifts/shifts.service';
import { EmployeeRecordsService } from './employee-records.service';
import type { EmployeeBulkDto } from './employee-operations.dto';

@Injectable()
export class EmployeeOperationsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly records: EmployeeRecordsService,
    private readonly shifts: ShiftsService,
  ) {}
  readiness(context: DomainContext, cursor?: string) {
    requirePermission(context, 'employees.read.all');
    return this.database.run(
      context,
      async (tx) => {
        const date = new Date(`${await approvalLocalDate(tx, context.organizationId)}T00:00:00Z`);
        const [employees, assignments, settings, policies] = await Promise.all([
          tx.employee.findMany({
            where: { organizationId: context.organizationId, status: 'ACTIVE' },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            take: 201,
            orderBy: { id: 'asc' },
            include: {
              user: { select: { isActive: true } },
              manager: { select: { status: true, userId: true } },
              shifts: {
                where: {
                  startsOn: { lte: date },
                  OR: [{ endsOn: null }, { endsOn: { gte: date } }],
                  shift: { isActive: true },
                },
                select: { id: true },
              },
              payrollPolicies: {
                where: {
                  effectiveFrom: { lte: date },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
                },
                select: { id: true },
              },
              compensations: {
                where: {
                  effectiveFrom: { lte: date },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
                },
                select: { id: true },
              },
              payComponents: {
                where: {
                  effectiveFrom: { lte: date },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
                  payComponent: { isActive: true },
                },
                select: { id: true },
              },
            },
          }),
          tx.leavePolicyAssignment.findMany({
            where: { organizationId: context.organizationId, leaveType: { isActive: true } },
            select: { branchId: true },
          }),
          tx.organizationSettings.findUnique({ where: { organizationId: context.organizationId } }),
          tx.approvalPolicy.findMany({
            where: { organizationId: context.organizationId, isActive: true, isDefault: true },
            select: { domain: true },
          }),
        ]);
        const activeLogins = await tx.userOrganization.findMany({
          where: {
            organizationId: context.organizationId,
            status: 'ACTIVE',
            userId: { in: employees.flatMap((item) => (item.userId ? [item.userId] : [])) },
          },
          select: { userId: true },
        });
        const logins = new Set(activeLogins.map((item) => item.userId));
        const leaveBranches = new Set(assignments.map((item) => item.branchId));
        const domains = new Set(policies.map((item) => item.domain));
        const items = employees.slice(0, 200).map((item) => {
          const issues: Array<{ code: string; message: string; module: string }> = [];
          const add = (code: string, message: string, module: string) =>
            issues.push({ code, message, module });
          if (!item.primaryBranchId) add('BRANCH', 'Assign a primary branch.', 'overview');
          if (!item.userId || !item.user?.isActive || !logins.has(item.userId))
            add('LOGIN', 'Link an active organization login.', 'overview');
          if (!item.manager || item.manager.status !== 'ACTIVE' || !item.manager.userId)
            add(
              'MANAGER',
              'Assign an active reporting manager or configure a backup approver.',
              'approvals',
            );
          if (!item.shifts.length && !settings?.workWeekDays.length)
            add('CALENDAR', 'Assign a shift or configure the organization workweek.', 'attendance');
          if (!item.primaryBranchId || !leaveBranches.has(item.primaryBranchId))
            add('LEAVE_TYPES', 'Assign leave types to the employee’s branch.', 'time-off');
          if (!domains.has('LEAVE'))
            add('LEAVE_APPROVALS', 'Configure a default leave approval workflow.', 'approvals');
          if (!domains.has('ATTENDANCE_CORRECTION'))
            add('CORRECTION_APPROVALS', 'Configure attendance correction routing.', 'approvals');
          if (
            !item.compensations.length &&
            !item.payrollPolicies.length &&
            !item.payComponents.length
          )
            add(
              'PAYROLL',
              'Assign an effective salary, salary policy or pay components.',
              'payroll',
            );
          return {
            id: item.id,
            employeeNumber: item.employeeNumber,
            name: `${item.firstName} ${item.lastName}`,
            issues,
            usingOrganizationCalendar:
              !item.shifts.length && Boolean(settings?.workWeekDays.length),
          };
        });
        return { items, nextCursor: employees.length > 200 ? employees[199]!.id : null };
      },
      { timeout: 30000 },
    );
  }

  preview(context: DomainContext, input: EmployeeBulkDto) {
    requirePermission(context, 'employees.read.all');
    requirePermission(context, input.kind === 'MANAGER' ? 'employees.write' : 'shifts.write');
    if (new Set(input.employeeIds).size !== input.employeeIds.length)
      throw new ConflictError('Select each employee once.');
    return this.database.run(context, async (tx) => {
      const people = await tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          id: { in: [...input.employeeIds, input.targetId] },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          managerEmployeeId: true,
          primaryBranchId: true,
          version: true,
          shifts: { select: { id: true, startsOn: true, endsOn: true, createdAt: true } },
        },
      });
      const manager = people.find((item) => item.id === input.targetId);
      const shift =
        input.kind === 'SHIFT'
          ? await tx.shift.findFirst({
              where: { id: input.targetId, organizationId: context.organizationId, isActive: true },
            })
          : null;
      if (input.kind === 'MANAGER' && manager?.status !== 'ACTIVE')
        throw new ConflictError('Choose an active manager in this organization.');
      if (input.kind === 'SHIFT' && !shift)
        throw new ConflictError('Choose an active shift in this organization.');
      const rows = input.employeeIds.map((id) => {
        const person = people.find((item) => item.id === id);
        return {
          id,
          name: person ? `${person.firstName} ${person.lastName}` : id,
          version: person?.version ?? 0,
          error:
            !person || person.status !== 'ACTIVE'
              ? 'Employee is unavailable.'
              : input.kind === 'MANAGER' && id === input.targetId
                ? 'An employee cannot report to themselves.'
                : shift?.branchId && person.primaryBranchId !== shift.branchId
                  ? 'Shift belongs to another branch.'
                  : null,
        };
      });
      const values = {
        kind: input.kind,
        employeeIds: input.employeeIds,
        targetId: input.targetId,
        startsOn: input.startsOn,
        reason: input.reason,
      };
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            input: values,
            rows,
            targetVersion: manager?.version,
            shiftVersion: shift?.updatedAt,
            assignments: people.map((person) => ({ id: person.id, shifts: person.shifts })),
          }),
        )
        .digest('hex');
      return {
        rows,
        fingerprint,
        valid: rows.filter((item) => !item.error).length,
        invalid: rows.filter((item) => item.error).length,
      };
    });
  }

  async apply(context: DomainContext, input: EmployeeBulkDto) {
    const preview = await this.preview(context, input);
    if (!input.fingerprint || input.fingerprint !== preview.fingerprint)
      throw new ConflictError('Employee setup changed. Preview the selection again.');
    const results: Array<{ id: string; name: string; outcome: string; message: string }> = [];
    for (const row of preview.rows) {
      try {
        if (row.error) throw new ConflictError(row.error);
        if (input.kind === 'MANAGER')
          await this.records.assignManager(
            { ...context, reason: input.reason },
            row.id,
            input.targetId,
          );
        else {
          const existing = await this.database.run(context, (tx) =>
            tx.employeeShiftAssignment.findFirst({
              where: {
                organizationId: context.organizationId,
                employeeId: row.id,
                shiftId: input.targetId,
                startsOn: new Date(`${input.startsOn}T00:00:00Z`),
                endsOn: null,
              },
            }),
          );
          if (!existing)
            await this.shifts.assign({ ...context, reason: input.reason }, row.id, {
              shiftId: input.targetId,
              startsOn: input.startsOn!,
            });
        }
        results.push({
          id: row.id,
          name: row.name,
          outcome: 'APPLIED',
          message: 'Assignment saved.',
        });
      } catch (caught) {
        results.push({
          id: row.id,
          name: row.name,
          outcome: 'FAILED',
          message: caught instanceof Error ? caught.message : 'Assignment failed.',
        });
      }
    }
    return { results };
  }
}
