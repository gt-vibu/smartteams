import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { describeDays, notify } from '../notifications/notify';
import { EmployeesService } from './employees.service';

const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const today = () => dateOnly(new Date().toISOString());

const SELECT = {
  id: true,
  employeeId: true,
  reason: true,
  requestedLastDay: true,
  lastWorkingDay: true,
  status: true,
  submittedAt: true,
  decidedAt: true,
  decisionComment: true,
  completedAt: true,
  employee: {
    select: { firstName: true, lastName: true, employeeNumber: true },
  },
} as const;

type Row = Prisma.EmployeeResignationGetPayload<{ select: typeof SELECT }>;

/**
 * Leaving the company, the way it actually happens.
 *
 * The employee hands in their resignation with the last day they would like. Someone who manages
 * employees accepts it — agreeing the last working day, which is recorded as their date of leaving
 * — or declines it with a reason. The employee may withdraw it until their last day. The day after
 * it, the daily pass off-boards them through the ordinary deactivation: login suspended, current
 * teams and projects ended, payroll marked for recalculation.
 */
@Injectable()
export class EmployeeResignationsService {
  private readonly logger = new Logger(EmployeeResignationsService.name);

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
  ) {}

  /** The caller's own resignations, newest first. */
  mine(context: DomainContext) {
    return this.database.run(context, async (tx) => {
      const self = await selfEmployee(tx, context);
      if (!self) return [];
      const rows = await tx.employeeResignation.findMany({
        where: { organizationId: context.organizationId, employeeId: self.id },
        orderBy: { submittedAt: 'desc' },
        take: 10,
        select: SELECT,
      });
      return rows.map(toDto);
    });
  }

  /** Everyone's open resignations and the last three months of decided ones. */
  list(context: DomainContext) {
    requirePermission(context, 'employees.write');
    const since = new Date(Date.now() - 90 * 86_400_000);
    return this.database.run(context, async (tx) => {
      const rows = await tx.employeeResignation.findMany({
        where: {
          organizationId: context.organizationId,
          OR: [{ status: { in: ['PENDING', 'ACCEPTED'] } }, { submittedAt: { gte: since } }],
        },
        orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
        take: 500,
        select: SELECT,
      });
      return rows.map(toDto);
    });
  }

  submit(context: DomainContext, input: { reason: string; requestedLastDay: string }) {
    // A person who manages employee records cannot submit a self-service resignation. The
    // employee UI hides the action for these roles too; enforce the same boundary on the API.
    if (context.permissions.has('*') || context.permissions.has('employees.write'))
      throw new ForbiddenDomainError(
        'Organization administrators cannot submit a self-service resignation.',
      );
    const reason = input.reason.trim();
    if (reason.length < 3) throw new ConflictError('Say briefly why you are leaving.');
    const lastDay = dateOnly(input.requestedLastDay);
    if (Number.isNaN(lastDay.getTime())) throw new ConflictError('Choose your last working day.');
    if (lastDay < today()) throw new ConflictError('Your last working day cannot be in the past.');
    return this.database.run(context, async (tx) => {
      const self = await selfEmployee(tx, context);
      if (!self || self.status !== 'ACTIVE')
        throw new ConflictError('Only a current employee can resign.');
      const open = await tx.employeeResignation.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: self.id,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        select: { id: true },
      });
      if (open) throw new ConflictError('You already have a resignation in progress.');
      const created = await tx.employeeResignation.create({
        data: {
          organizationId: context.organizationId,
          employeeId: self.id,
          reason,
          requestedLastDay: lastDay,
        },
        select: SELECT,
      });
      await notify(tx, context, {
        recipients: [self.manager?.userId, ...(await peopleManagers(tx, context.organizationId))],
        kind: 'RESIGNATION_SUBMITTED',
        title: 'A resignation was handed in',
        body: `${self.firstName} ${self.lastName} has resigned, asking for ${describeDays(lastDay, lastDay)} as their last day.`,
        module: 'employees',
        entityType: 'EMPLOYEE_RESIGNATION',
        entityId: created.id,
      });
      await this.record(context, tx, created.id, 'RESIGNATION_SUBMITTED', null, created);
      return toDto(created);
    });
  }

  withdraw(context: DomainContext, resignationId: string) {
    return this.database.run(context, async (tx) => {
      const self = await selfEmployee(tx, context);
      const found = await tx.employeeResignation.findFirst({
        where: { id: resignationId, organizationId: context.organizationId },
      });
      if (!found || !self || found.employeeId !== self.id) throw new NotFoundError('Resignation');
      if (found.status !== 'PENDING' && found.status !== 'ACCEPTED')
        throw new ConflictError('This resignation can no longer be withdrawn.');
      if (found.lastWorkingDay && found.lastWorkingDay < today())
        throw new ConflictError('Your last working day has passed.');
      const updated = await tx.employeeResignation.update({
        where: { id: found.id },
        data: { status: 'WITHDRAWN' },
        select: SELECT,
      });
      // The agreed leaving date goes with it, unless someone has since set a different one.
      if (found.lastWorkingDay)
        await tx.employee.updateMany({
          where: { id: self.id, dateOfLeaving: found.lastWorkingDay },
          data: { dateOfLeaving: null },
        });
      await notify(tx, context, {
        recipients: [self.manager?.userId, found.decidedByUserId],
        kind: 'RESIGNATION_WITHDRAWN',
        title: 'A resignation was withdrawn',
        body: `${self.firstName} ${self.lastName} has withdrawn their resignation.`,
        module: 'employees',
        entityType: 'EMPLOYEE_RESIGNATION',
        entityId: found.id,
      });
      await this.record(context, tx, found.id, 'RESIGNATION_WITHDRAWN', found, updated);
      return toDto(updated);
    });
  }

  decide(
    context: DomainContext,
    resignationId: string,
    input: { accept: boolean; lastWorkingDay?: string; comment?: string },
  ) {
    requirePermission(context, 'employees.write');
    const comment = input.comment?.trim() ?? '';
    return this.database.run(context, async (tx) => {
      const found = await tx.employeeResignation.findFirst({
        where: { id: resignationId, organizationId: context.organizationId },
        include: { employee: { select: { userId: true } } },
      });
      if (!found) throw new NotFoundError('Resignation');
      if (found.employee.userId && found.employee.userId === context.actor.userId)
        throw new ForbiddenDomainError('You cannot decide your own resignation.');
      if (found.status !== 'PENDING') throw new ConflictError('This resignation has been decided.');
      const lastDay = input.accept
        ? dateOnly(input.lastWorkingDay ?? found.requestedLastDay.toISOString())
        : null;
      if (lastDay && (Number.isNaN(lastDay.getTime()) || lastDay < today()))
        throw new ConflictError('The last working day cannot be in the past.');
      const updated = await tx.employeeResignation.update({
        where: { id: found.id },
        data: {
          status: input.accept ? 'ACCEPTED' : 'REJECTED',
          lastWorkingDay: lastDay,
          decidedAt: new Date(),
          decidedByUserId: context.actor.userId ?? null,
          decisionComment: comment || null,
        },
        select: SELECT,
      });
      if (lastDay)
        await tx.employee.update({
          where: { id: found.employeeId },
          data: { dateOfLeaving: lastDay, version: { increment: 1 } },
        });
      await notify(tx, context, {
        recipients: [found.employee.userId],
        kind: 'RESIGNATION_DECIDED',
        title: input.accept ? 'Your resignation was accepted' : 'Your resignation was not accepted',
        body: lastDay
          ? `Your last working day is ${describeDays(lastDay, lastDay)}.`
          : 'Your resignation request was reviewed and declined.',
        module: 'home',
        entityType: 'EMPLOYEE_RESIGNATION',
        entityId: found.id,
      });
      await this.record(
        context,
        tx,
        found.id,
        input.accept ? 'RESIGNATION_ACCEPTED' : 'RESIGNATION_REJECTED',
        found,
        updated,
      );
      return toDto(updated);
    });
  }

  /** Off-boards everyone whose agreed last working day is over. Idempotent. */
  async completeDue() {
    const due = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
    );
    let completed = 0;
    for (const organization of due) {
      const context = systemContext(organization.id);
      const rows = await this.database.run(context, (tx) =>
        tx.employeeResignation.findMany({
          where: {
            organizationId: organization.id,
            status: 'ACCEPTED',
            lastWorkingDay: { lt: today() },
          },
          select: {
            id: true,
            employeeId: true,
            lastWorkingDay: true,
            employee: { select: { status: true } },
          },
        }),
      );
      for (const row of rows) {
        try {
          if (row.employee.status === 'ACTIVE')
            await this.employees.deactivate(
              context,
              row.employeeId,
              `Resigned; last working day ${row.lastWorkingDay?.toISOString().slice(0, 10)}`,
            );
          await this.database.run(context, (tx) =>
            tx.employeeResignation.update({
              where: { id: row.id },
              data: { status: 'COMPLETED', completedAt: new Date() },
            }),
          );
          completed += 1;
        } catch (caught) {
          this.logger.warn(
            `Resignation ${row.id} not completed: ${caught instanceof Error ? caught.message : String(caught)}`,
          );
        }
      }
    }
    return completed;
  }

  private record(
    context: DomainContext,
    tx: Prisma.TransactionClient,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record(
      context,
      {
        entityType: 'EMPLOYEE_RESIGNATION',
        entityId: id,
        action,
        ...(before ? { beforeState: jsonSnapshot(before) } : {}),
        afterState: jsonSnapshot(after),
      },
      tx,
    );
  }
}

function selfEmployee(tx: Prisma.TransactionClient, context: DomainContext) {
  if (!context.actor.userId) return Promise.resolve(null);
  return tx.employee.findFirst({
    where: { organizationId: context.organizationId, userId: context.actor.userId },
    select: {
      id: true,
      status: true,
      firstName: true,
      lastName: true,
      manager: { select: { userId: true } },
    },
  });
}

/** Everyone who may accept a resignation: holders of a role that manages employees. */
async function peopleManagers(tx: Prisma.TransactionClient, organizationId: string) {
  const now = new Date();
  const holders = await tx.userRole.findMany({
    where: {
      organizationId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      user: { isActive: true },
      role: {
        permissions: { some: { permission: { key: { in: ['employees.write', '*'] } } } },
      },
    },
    select: { userId: true },
  });
  return holders.map((holder) => holder.userId);
}

function toDto(row: Row) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employee: {
      name: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      employeeNumber: row.employee.employeeNumber,
    },
    reason: row.reason,
    requestedLastDay: row.requestedLastDay.toISOString().slice(0, 10),
    lastWorkingDay: row.lastWorkingDay?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionComment: row.decisionComment,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function systemContext(organizationId: string): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    correlationId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set(['employees.write']),
  };
}
