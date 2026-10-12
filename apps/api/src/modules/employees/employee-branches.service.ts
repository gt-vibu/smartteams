import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import {
  activeEmployee,
  assertAfterJoining,
  calendarDate,
  dayBefore,
  ensurePrimaryRow,
  isoDay,
  memberships,
  membershipState,
  openBranch,
  organizationToday,
  overlaps,
} from './employee-branch-rules';
import { transferPrimary } from './employee-branch-transfer';

/**
 * One employee's branches: the primary they belong to, the others they also work from, and the
 * history of both. The rules are in `employee-branch-rules.ts`; this is the four things a person
 * can do with them — look, add a branch, move the primary, and end or cancel a membership.
 */
@Injectable()
export class EmployeeBranchesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  list(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        select: {
          id: true,
          primaryBranchId: true,
          dateOfJoining: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      });
      if (!employee) throw new NotFoundError('Employee');
      const today = await organizationToday(tx, context.organizationId);
      if (employee.primaryBranchId) {
        await ensurePrimaryRow(
          tx,
          context.organizationId,
          employee,
          today,
          context.accessMode,
          false,
        );
      }
      return this.view(tx, context.organizationId, employeeId, today);
    });
  }

  /** An additional branch. The primary moves only by transfer, so this never touches it. */
  add(
    context: DomainContext,
    employeeId: string,
    input: { branchId: string; startsOn: string; endsOn?: string },
  ) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const { employee, rows, today } = await this.prepare(tx, context, employeeId);
      const branch = await openBranch(tx, context.organizationId, input.branchId);
      const startsOn = calendarDate(input.startsOn);
      const endsOn = input.endsOn ? calendarDate(input.endsOn) : null;
      if (endsOn && endsOn < startsOn)
        throw new ConflictError('A branch membership cannot end before it starts.');
      assertAfterJoining(employee, startsOn);
      const clash = rows.find(
        (row) => row.branchId === branch.id && overlaps(row, { startsOn, endsOn }),
      );
      if (clash)
        throw new ConflictError(
          `${employee.firstName} already belongs to ${branch.name} ${describe(clash)}.`,
        );
      const created = await tx.employeeBranchAssignment.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          branchId: branch.id,
          isPrimary: false,
          startsOn,
          endsOn,
          sourceAccessMode: context.accessMode,
        },
      });
      await this.record(context, tx, created.id, 'EMPLOYEE_BRANCH_ADDED', null, created);
      return this.view(tx, context.organizationId, employeeId, today);
    });
  }

  /**
   * Moves the primary branch from `effectiveFrom`. The old primary ends the day before; nothing is
   * overwritten. If the employee already works at the new branch as an additional one, that
   * membership ends the day before too, because a branch cannot be both at once.
   */
  transfer(
    context: DomainContext,
    employeeId: string,
    input: { branchId: string; effectiveFrom: string },
  ) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const { employee, rows, today } = await this.prepare(tx, context, employeeId);
      const branch = await openBranch(tx, context.organizationId, input.branchId);
      const { created, previous } = await transferPrimary(
        tx,
        context,
        employee,
        rows,
        branch,
        calendarDate(input.effectiveFrom),
        today,
      );
      if (created)
        await this.record(
          context,
          tx,
          created.id,
          'EMPLOYEE_PRIMARY_BRANCH_TRANSFERRED',
          previous,
          created,
        );
      return this.view(tx, context.organizationId, employeeId, today);
    });
  }

  /** Ends an additional branch. The primary never just ends — it is replaced by a transfer. */
  end(context: DomainContext, employeeId: string, assignmentId: string, input: { endsOn: string }) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const { rows, today } = await this.prepare(tx, context, employeeId);
      const row = rows.find((entry) => entry.id === assignmentId);
      if (!row) throw new NotFoundError('Branch membership');
      if (row.isPrimary)
        throw new ConflictError(
          'The primary branch cannot simply end. Transfer to another branch instead.',
        );
      const endsOn = calendarDate(input.endsOn);
      if (endsOn < row.startsOn)
        throw new ConflictError(
          `This membership starts on ${isoDay(row.startsOn)}; it cannot end before that.`,
        );
      if (row.endsOn && row.endsOn < today)
        throw new ConflictError(`This membership already ended on ${isoDay(row.endsOn)}.`);
      const updated = await tx.employeeBranchAssignment.update({
        where: { id: row.id },
        data: { endsOn },
      });
      await this.record(context, tx, row.id, 'EMPLOYEE_BRANCH_ENDED', row, updated);
      return this.view(tx, context.organizationId, employeeId, today);
    });
  }

  /**
   * Withdraws a membership that has not started. It never took effect, so it is removed; the audit
   * record keeps what it was. Cancelling a scheduled transfer puts the previous primary back.
   */
  cancel(context: DomainContext, employeeId: string, assignmentId: string) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const { rows, today } = await this.prepare(tx, context, employeeId);
      const row = rows.find((entry) => entry.id === assignmentId);
      if (!row) throw new NotFoundError('Branch membership');
      if (membershipState(row, today) !== 'UPCOMING')
        throw new ConflictError(
          'Only a membership that has not started yet can be cancelled. End it instead.',
        );
      // Removed before the previous primary reopens: both are open-ended primaries, and only one
      // may exist at a time.
      await tx.employeeBranchAssignment.delete({ where: { id: row.id } });
      if (row.isPrimary) {
        const previous = rows.find(
          (entry) =>
            entry.isPrimary && entry.endsOn?.getTime() === dayBefore(row.startsOn).getTime(),
        );
        if (previous)
          await tx.employeeBranchAssignment.update({
            where: { id: previous.id },
            data: { endsOn: null },
          });
      }
      await this.record(context, tx, row.id, 'EMPLOYEE_BRANCH_CANCELLED', row, null);
      return this.view(tx, context.organizationId, employeeId, today);
    });
  }

  private async prepare(tx: Prisma.TransactionClient, context: DomainContext, employeeId: string) {
    const employee = await activeEmployee(tx, context.organizationId, employeeId);
    const today = await organizationToday(tx, context.organizationId);
    // One change at a time per employee, so two transfers cannot both see the same current row.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`branches:${employeeId}`}, 0))`;
    const rows = await ensurePrimaryRow(
      tx,
      context.organizationId,
      employee,
      today,
      context.accessMode,
    );
    return { employee, rows, today };
  }

  private async view(
    tx: TenantTransaction,
    organizationId: string,
    employeeId: string,
    today?: Date,
  ) {
    const day = today ?? (await organizationToday(tx, organizationId));
    const rows = await memberships(tx, organizationId, employeeId);
    const branches = await tx.branch.findMany({
      where: { organizationId, id: { in: [...new Set(rows.map((row) => row.branchId))] } },
      select: { id: true, name: true, code: true },
    });
    const byId = new Map(branches.map((branch) => [branch.id, branch]));
    return rows.map((row) => ({
      id: row.id,
      branchId: row.branchId,
      branchName: byId.get(row.branchId)?.name ?? null,
      branchCode: byId.get(row.branchId)?.code ?? null,
      relationship: row.isPrimary ? ('PRIMARY' as const) : ('ADDITIONAL' as const),
      startsOn: isoDay(row.startsOn),
      endsOn: row.endsOn ? isoDay(row.endsOn) : null,
      state: membershipState(row, day),
    }));
  }

  private record(
    context: DomainContext,
    tx: Prisma.TransactionClient,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record(
      context,
      {
        entityType: 'EMPLOYEE_BRANCH_ASSIGNMENT',
        entityId,
        action,
        ...(before ? { beforeState: jsonSnapshot(before) } : {}),
        ...(after ? { afterState: jsonSnapshot(after) } : {}),
      },
      tx,
    );
  }
}

function describe(row: { startsOn: Date; endsOn: Date | null }) {
  return row.endsOn
    ? `from ${isoDay(row.startsOn)} to ${isoDay(row.endsOn)}`
    : `from ${isoDay(row.startsOn)}`;
}
