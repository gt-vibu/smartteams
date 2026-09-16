import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AttendanceStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { createAttendanceCorrection } from './attendance-correction-create';
import { workDateInTimeZone } from './attendance-shared';
import { missingCheckOutFrom } from './attendance-missing-checkout';
import {
  autoCloseSnapshot,
  instantAtLocalTime,
  wallClock,
  AUTO_CLOSE_REASON,
} from './attendance-auto-checkout';

export type AutoCloseOutcome = {
  /** Days for which a review was raised. */
  closed: number;
  /** Days left alone, and why. */
  skippedNightShift: number;
  skippedAlreadyPending: number;
  failed: number;
};

const EMPTY: AutoCloseOutcome = {
  closed: 0,
  skippedNightShift: 0,
  skippedAlreadyPending: 0,
  failed: 0,
};

/** No organization should be able to stall the loop behind an unbounded day. */
const BATCH = 200;

/** How far back a sweep looks, so a worker that was stopped overnight still catches up. */
const LOOK_BACK_DAYS = 3;

/**
 * Closing days nobody checked out of, once the organization's day is over.
 *
 * This proposes; it never decides. For each open day it raises the ordinary missing-check-out
 * correction at the organization's cutoff time, which goes to whoever their attendance approval
 * policy names. Until that person accepts it, replaces the time, or rejects it, the day still
 * counts no worked minutes and no overtime — a clock reaching midnight never puts hours on a
 * timesheet or a payslip.
 *
 * Nothing here is automatic for a night shift: a shift that crosses midnight is genuinely still
 * being worked at 23:59, so those days are left for a person to close.
 */
@Injectable()
export class AttendanceAutoCheckOutService {
  private readonly logger = new Logger(AttendanceAutoCheckOutService.name);

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Every organization that has asked for it, called by the scheduled job. */
  async closeDueDays(now = new Date()): Promise<AutoCloseOutcome> {
    const organizations = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({
        where: { status: 'ACTIVE', settings: { autoCheckOutMode: 'REVIEW_REQUIRED' } },
        select: { id: true, timezone: true },
      }),
    );
    let total = { ...EMPTY };
    for (const organization of organizations) {
      try {
        const outcome = await this.closeOrganization(
          systemContext(organization.id),
          organization.timezone,
          now,
        );
        total = add(total, outcome);
      } catch (caught) {
        // One organization's misconfiguration — no approval policy, say — must not stop the rest.
        this.logger.warn(
          `Automatic check-out skipped for organization ${organization.id}: ${message(caught)}`,
        );
        total = add(total, { ...EMPTY, failed: 1 });
      }
    }
    return total;
  }

  /**
   * The same close for one organization, on request.
   *
   * An administrator who has just turned the setting on, or who is waiting on today's reviews,
   * can run it rather than wait for the next sweep. The corrections it raises are identical to
   * the scheduled ones; only the audit entry records who asked.
   */
  async runNow(context: DomainContext, now = new Date()): Promise<AutoCloseOutcome> {
    requirePermission(context, 'attendance.preferences.write');
    const organization = await this.database.run(context, (tx) =>
      tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { timezone: true, settings: { select: { autoCheckOutMode: true } } },
      }),
    );
    const outcome =
      organization.settings?.autoCheckOutMode === 'REVIEW_REQUIRED'
        ? await this.closeOrganization(
            systemContext(context.organizationId),
            organization.timezone,
            now,
          )
        : { ...EMPTY };
    await this.database.run(context, (tx) =>
      this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'ATTENDANCE_AUTO_CHECK_OUT_RUN',
          afterState: jsonSnapshot(outcome),
        },
        tx,
      ),
    );
    return outcome;
  }

  private async closeOrganization(
    context: DomainContext,
    timeZone: string,
    now = new Date(),
  ): Promise<AutoCloseOutcome> {
    const settings = await this.database.run(context, (tx) =>
      tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: { autoCheckOutMode: true, autoCheckOutAt: true },
      }),
    );
    if (settings.autoCheckOutMode !== 'REVIEW_REQUIRED') return { ...EMPTY };

    // Days are closed after their own cutoff, not the current one: the sweep that runs at five
    // past midnight is closing yesterday. The look-back also lets a stopped worker catch up.
    const today = workDateInTimeZone(now, timeZone);
    const from = new Date(`${today}T00:00:00.000Z`);
    from.setUTCDate(from.getUTCDate() - LOOK_BACK_DAYS);
    const cutoff = wallClock(settings.autoCheckOutAt);

    const open = await this.database.run(context, (tx) =>
      tx.attendanceRecord.findMany({
        where: {
          organizationId: context.organizationId,
          workDate: { gte: from, lte: new Date(`${today}T00:00:00.000Z`) },
          status: AttendanceStatus.OPEN,
        },
        include: {
          punches: { orderBy: { occurredAt: 'asc' } },
          employee: { include: { manager: { select: { userId: true } } } },
        },
        orderBy: { workDate: 'asc' },
        take: BATCH,
      }),
    );

    let outcome = { ...EMPTY };
    for (const record of open) {
      const workDateKey = record.workDate.toISOString().slice(0, 10);
      const closeAt = instantAtLocalTime(workDateKey, cutoff, timeZone);
      // Before its own cutoff the employee may still be at work, and may yet check out themselves.
      if (now < closeAt) continue;
      try {
        // Each day in its own transaction: one that cannot be routed does not roll back the rest.
        const result = await this.database.run(context, (tx) =>
          this.closeDay(tx, context, record, closeAt, workDateKey),
        );
        outcome = add(outcome, result);
      } catch (caught) {
        this.logger.warn(`Automatic check-out skipped for day ${record.id}: ${message(caught)}`);
        outcome = add(outcome, { ...EMPTY, failed: 1 });
      }
    }
    return outcome;
  }

  private async closeDay(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    record: OpenDay,
    closeAt: Date,
    workDateKey: string,
  ): Promise<AutoCloseOutcome> {
    // A day that is not simply "checked in and never out" is left alone.
    const lastPunch = record.punches.at(-1);
    if (!lastPunch || lastPunch.punchType !== 'IN') return { ...EMPTY };

    const nightShift = await tx.employeeShiftAssignment.findFirst({
      where: {
        organizationId: context.organizationId,
        employeeId: record.employeeId,
        startsOn: { lte: new Date(`${workDateKey}T00:00:00.000Z`) },
        OR: [{ endsOn: null }, { endsOn: { gte: new Date(`${workDateKey}T00:00:00.000Z`) } }],
        shift: { crossesMidnight: true },
      },
      select: { id: true },
    });
    if (nightShift) return { ...EMPTY, skippedNightShift: 1 };

    const pending = await tx.attendanceCorrection.findMany({
      where: { attendanceRecordId: record.id, status: 'PENDING' },
      select: { afterSnapshot: true },
    });
    // Idempotent: a sweep that runs again, or an employee who already asked for the check-out
    // themselves, must not produce a second request for the same day.
    if (pending.some((correction) => missingCheckOutFrom(correction.afterSnapshot)))
      return { ...EMPTY, skippedAlreadyPending: 1 };

    await createAttendanceCorrection(
      tx,
      this.audit,
      context,
      record,
      AUTO_CLOSE_REASON,
      autoCloseSnapshot(jsonSnapshot(record), closeAt),
    );
    return { ...EMPTY, closed: 1 };
  }
}

type OpenDay = {
  id: string;
  employeeId: string;
  workDate: Date;
  branchId: string | null;
  punches: Array<{ punchType: string; occurredAt: Date }>;
  employee: { userId: string | null; manager: { userId: string | null } | null };
};

/**
 * The actor for a close.
 *
 * No person asked for these, so none is recorded as having: the correction carries no requester,
 * and the audit trail says SYSTEM. It holds only the permissions the close itself needs.
 */
function systemContext(organizationId: string): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    // The audit trail keys on ids, not names: who did it is the SYSTEM actor above.
    correlationId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set(['attendance.corrections.write']),
  };
}

function add(left: AutoCloseOutcome, right: AutoCloseOutcome): AutoCloseOutcome {
  return {
    closed: left.closed + right.closed,
    skippedNightShift: left.skippedNightShift + right.skippedNightShift,
    skippedAlreadyPending: left.skippedAlreadyPending + right.skippedAlreadyPending,
    failed: left.failed + right.failed,
  };
}

function message(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}
