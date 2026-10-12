import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { markPayrollStale } from '../payroll/payroll-staleness';

/**
 * ISO weekday numbers: 1 is Monday, 7 is Sunday. `unmarkedDaysAreAbsent`: a working day with no
 * attendance, leave or holiday costs a day's pay (loss of pay). On unless the company turns it
 * off, for example because some staff do not record attendance.
 */
export type WorkWeek = { workWeekDays: number[]; unmarkedDaysAreAbsent: boolean };

/** Read from the settings' metadata, where company switches without their own column live. */
export function unmarkedDaysAreAbsent(metadata: unknown): boolean {
  const value =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>).unmarkedDaysAreAbsent
      : undefined;
  return value !== false;
}

/**
 * The organization's working days. Every day not listed is a weekly off.
 *
 * The setting already drove payroll (which days count as working, and so as absences) and leave
 * (which days a request costs), but nothing could change it: every company was Monday to Friday.
 * It is kept apart from the attendance preferences because those are also served to federation
 * partners, whose contract must not change.
 */
@Injectable()
export class AttendanceWorkWeekService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Readable by anyone who can see their own attendance: calendars need it to mark weekends. */
  async get(
    context: DomainContext,
    permission: 'attendance.read' | 'attendance.preferences.read' = 'attendance.read',
  ): Promise<WorkWeek> {
    requirePermission(context, permission);
    return this.database.run(context, async (tx) => {
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: { workWeekDays: true, metadata: true },
      });
      return {
        workWeekDays: [...settings.workWeekDays].sort((a, b) => a - b),
        unmarkedDaysAreAbsent: unmarkedDaysAreAbsent(settings.metadata),
      };
    });
  }

  async update(
    context: DomainContext,
    workWeekDays: number[],
    absentWhenUnmarked?: boolean,
  ): Promise<WorkWeek> {
    requirePermission(context, 'attendance.preferences.write');
    const days = [...new Set(workWeekDays)].sort((a, b) => a - b);
    if (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
      throw new ConflictError('Choose at least one working day, Monday (1) to Sunday (7)');
    return this.database.run(context, async (tx) => {
      const before = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      const updated = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: {
          workWeekDays: days,
          ...(absentWhenUnmarked === undefined
            ? {}
            : {
                metadata: {
                  ...((before.metadata as Record<string, unknown> | null) ?? {}),
                  unmarkedDaysAreAbsent: absentWhenUnmarked,
                },
              }),
        },
      });
      // Which days are working days decides absences and proration, so an unreleased payroll run
      // priced on the old week is no longer right. From the start of this month onwards.
      const now = new Date();
      await markPayrollStale(
        tx,
        context.organizationId,
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      );
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'WORK_WEEK_UPDATED',
          beforeState: jsonSnapshot({
            workWeekDays: before.workWeekDays,
            unmarkedDaysAreAbsent: unmarkedDaysAreAbsent(before.metadata),
          }),
          afterState: jsonSnapshot({
            workWeekDays: updated.workWeekDays,
            unmarkedDaysAreAbsent: unmarkedDaysAreAbsent(updated.metadata),
          }),
        },
        tx,
      );
      return { workWeekDays: days, unmarkedDaysAreAbsent: unmarkedDaysAreAbsent(updated.metadata) };
    });
  }
}
