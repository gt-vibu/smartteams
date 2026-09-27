import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { describeDays, notify } from '../notifications/notify';

const DAY_MS = 86_400_000;
const dateOnly = (value: string | Date) =>
  new Date(
    `${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T00:00:00.000Z`,
  );
const today = () => dateOnly(new Date());
/** How far ahead people are told a probation ends or a document expires. */
const PROBATION_NOTICE_DAYS = 7;
const DOCUMENT_NOTICE_DAYS = 30;

/**
 * Dates in an employee's working life that someone has to act on: the end of probation, and
 * documents — a passport, a visa, a contract — that stop being valid.
 *
 * Probation is set when someone joins and ends in confirmation or an extension. A week before it
 * ends, their manager and HR are told. A document with an expiry date is flagged to its person and
 * HR a month ahead, and again on the day it lapses if nobody has replaced it.
 */
@Injectable()
export class EmployeeMilestonesService {
  private readonly logger = new Logger(EmployeeMilestonesService.name);

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Everyone on probation, soonest ending first. */
  probationList(context: DomainContext) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const rows = await tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          probationEndsOn: { not: null },
          confirmedOn: null,
        },
        orderBy: { probationEndsOn: 'asc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          dateOfJoining: true,
          probationEndsOn: true,
          manager: { select: { firstName: true, lastName: true } },
        },
      });
      const now = today().getTime();
      return rows.map((row) => ({
        employeeId: row.id,
        name: `${row.firstName} ${row.lastName}`.trim(),
        employeeNumber: row.employeeNumber,
        manager: row.manager ? `${row.manager.firstName} ${row.manager.lastName}`.trim() : null,
        dateOfJoining: row.dateOfJoining?.toISOString().slice(0, 10) ?? null,
        probationEndsOn: row.probationEndsOn!.toISOString().slice(0, 10),
        daysLeft: Math.round((row.probationEndsOn!.getTime() - now) / DAY_MS),
      }));
    });
  }

  /** Puts someone on probation until a date, or takes them off it (null). */
  setProbation(context: DomainContext, employeeId: string, endsOn: string | null) {
    requirePermission(context, 'employees.write');
    return this.change(context, employeeId, 'EMPLOYEE_PROBATION_SET', async (tx, employee) => {
      const end = endsOn ? dateOnly(endsOn) : null;
      if (end && employee.dateOfJoining && end <= employee.dateOfJoining)
        throw new ConflictError('Probation must end after the joining date.');
      return tx.employee.update({
        where: { id: employee.id },
        data: { probationEndsOn: end, confirmedOn: null, version: { increment: 1 } },
      });
    });
  }

  /** Confirms someone in their job, or extends their probation to a later date. */
  confirm(context: DomainContext, employeeId: string, input: { extendTo?: string; note?: string }) {
    requirePermission(context, 'employees.write');
    return this.change(context, employeeId, 'EMPLOYEE_CONFIRMED', async (tx, employee) => {
      if (!employee.probationEndsOn) throw new ConflictError('This person is not on probation.');
      if (input.extendTo) {
        const until = dateOnly(input.extendTo);
        if (until <= employee.probationEndsOn)
          throw new ConflictError('Extend probation to a later date than it ends now.');
        const updated = await tx.employee.update({
          where: { id: employee.id },
          data: { probationEndsOn: until, version: { increment: 1 } },
        });
        await notify(tx, context, {
          recipients: [employee.userId],
          kind: 'PROBATION_EXTENDED',
          title: 'Your probation was extended',
          body: `Your probation now ends on ${describeDays(until, until)}.${input.note ? ` ${input.note}` : ''}`,
          module: 'home',
          entityType: 'EMPLOYEE',
          entityId: employee.id,
        });
        return updated;
      }
      const updated = await tx.employee.update({
        where: { id: employee.id },
        data: { confirmedOn: today(), version: { increment: 1 } },
      });
      await notify(tx, context, {
        recipients: [employee.userId],
        kind: 'PROBATION_CONFIRMED',
        title: 'You are confirmed',
        body: `Congratulations — your probation is complete and you are confirmed in your role.${input.note ? ` ${input.note}` : ''}`,
        module: 'home',
        entityType: 'EMPLOYEE',
        entityId: employee.id,
      });
      return updated;
    });
  }

  /** The daily look-ahead: probation ending soon, documents expiring. Idempotent. */
  async sweep() {
    const organizations = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
    );
    let told = 0;
    for (const organization of organizations) {
      const context = systemContext(organization.id);
      try {
        told += await this.database.run(context, async (tx) => {
          const hr = await peopleManagers(tx, organization.id);
          return (
            (await this.probationDue(tx, context, hr)) +
            (await this.documentsExpiring(tx, context, hr))
          );
        });
      } catch (caught) {
        this.logger.warn(
          `Milestones skipped for ${organization.id}: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }
    return told;
  }

  private async probationDue(tx: Prisma.TransactionClient, context: DomainContext, hr: string[]) {
    const due = await tx.employee.findMany({
      where: {
        organizationId: context.organizationId,
        status: 'ACTIVE',
        confirmedOn: null,
        probationEndsOn: { lte: new Date(today().getTime() + PROBATION_NOTICE_DAYS * DAY_MS) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        probationEndsOn: true,
        manager: { select: { userId: true } },
      },
    });
    let told = 0;
    for (const person of due) {
      const already = await tx.notification.findFirst({
        where: {
          organizationId: context.organizationId,
          kind: 'PROBATION_DUE',
          entityId: person.id,
          createdAt: { gt: new Date(Date.now() - 30 * DAY_MS) },
        },
        select: { id: true },
      });
      if (already) continue;
      const end = person.probationEndsOn!;
      await notify(tx, context, {
        recipients: [person.manager?.userId, ...hr],
        kind: 'PROBATION_DUE',
        title: 'Probation ending',
        body: `${person.firstName} ${person.lastName}'s probation ${end < today() ? 'ended' : 'ends'} on ${describeDays(end, end)}. Confirm them or extend it.`,
        module: 'employees',
        entityType: 'EMPLOYEE',
        entityId: person.id,
      });
      told += 1;
    }
    return told;
  }

  private async documentsExpiring(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    hr: string[],
  ) {
    const horizon = new Date(today().getTime() + DOCUMENT_NOTICE_DAYS * DAY_MS);
    const files = await tx.fileObject.findMany({
      where: {
        organizationId: context.organizationId,
        deletedAt: null,
        status: 'AVAILABLE',
        expiresOn: { not: null, lte: horizon },
      },
      select: {
        id: true,
        originalName: true,
        expiresOn: true,
        expiryNotifiedAt: true,
        uploadedByUserId: true,
        employee: { select: { userId: true, firstName: true, lastName: true } },
      },
    });
    let told = 0;
    for (const file of files) {
      const expiresOn = file.expiresOn!;
      const lapsed = expiresOn <= today();
      // Once a month ahead, and once more on the day it lapses.
      const due = !file.expiryNotifiedAt || (lapsed && file.expiryNotifiedAt < expiresOn);
      if (!due) continue;
      const whose = file.employee ? `${file.employee.firstName} ${file.employee.lastName}'s ` : '';
      await notify(tx, context, {
        recipients: [file.employee?.userId ?? file.uploadedByUserId, ...hr],
        kind: 'DOCUMENT_EXPIRING',
        title: lapsed ? 'A document has expired' : 'A document expires soon',
        body: `${whose}"${file.originalName}" ${lapsed ? 'expired' : 'expires'} on ${describeDays(expiresOn, expiresOn)}. Upload the renewed one.`,
        module: 'files',
        entityType: 'FILE_OBJECT',
        entityId: file.id,
      });
      await tx.fileObject.update({
        where: { id: file.id },
        data: { expiryNotifiedAt: new Date() },
      });
      told += 1;
    }
    return told;
  }

  private change(
    context: DomainContext,
    employeeId: string,
    action: string,
    work: (
      tx: Prisma.TransactionClient,
      employee: {
        id: string;
        userId: string | null;
        dateOfJoining: Date | null;
        probationEndsOn: Date | null;
      },
    ) => Promise<unknown>,
  ) {
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        select: {
          id: true,
          userId: true,
          dateOfJoining: true,
          probationEndsOn: true,
          confirmedOn: true,
        },
      });
      if (!employee) throw new NotFoundError('Employee');
      const after = await work(tx, employee);
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          action,
          beforeState: jsonSnapshot(employee),
          afterState: jsonSnapshot(after),
        },
        tx,
      );
      return { saved: true };
    });
  }
}

async function peopleManagers(tx: Prisma.TransactionClient, organizationId: string) {
  const now = new Date();
  const holders = await tx.userRole.findMany({
    where: {
      organizationId,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      user: { isActive: true },
      role: { permissions: { some: { permission: { key: { in: ['employees.write', '*'] } } } } },
    },
    select: { userId: true },
  });
  return [...new Set(holders.map((holder) => holder.userId))];
}

function systemContext(organizationId: string): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    correlationId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set<string>(),
  };
}
