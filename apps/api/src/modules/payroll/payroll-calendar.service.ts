import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { dateOnly } from './payroll-calculation';
import { validateCalendarMonth } from './payroll-shared';

/**
 * The payroll calendar: which month a tenant is currently paying, and when that window closes.
 *
 * Split out of `PayrollService` because it shares nothing with pay calculation beyond the tenant
 * it belongs to. Behaviour is unchanged; only its address is.
 */
@Injectable()
export class PayrollCalendarService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getCalendar(
    context: DomainContext,
    year = new Date().getUTCFullYear(),
    month = new Date().getUTCMonth() + 1,
  ) {
    requirePermission(context, 'payroll.calendars.read');
    validateCalendarMonth(year, month);
    return this.database.run(context, async (tx) => {
      const [settings, calendar] = await Promise.all([
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
          select: { payrollFrequency: true, payrollDayOfMonth: true },
        }),
        tx.payrollCalendar.findUnique({
          where: {
            organizationId_year_month: { organizationId: context.organizationId, year, month },
          },
        }),
      ]);
      return { ...settings, calendar };
    });
  }
  async updateCalendar(
    context: DomainContext,
    input: {
      year: number;
      month: number;
      periodStart?: string;
      periodEnd?: string;
      attendanceFreezeDate?: string;
      calculationDate?: string;
      releaseDate?: string;
      salaryCreditDate?: string;
    },
  ) {
    requirePermission(context, 'payroll.calendars.write');
    validateCalendarMonth(input.year, input.month);
    const periodStart = dateOnly(
      input.periodStart ?? `${input.year}-${String(input.month).padStart(2, '0')}-01`,
    );
    const periodEnd = dateOnly(
      input.periodEnd ??
        `${input.year}-${String(input.month).padStart(2, '0')}-${String(new Date(Date.UTC(input.year, input.month, 0)).getUTCDate()).padStart(2, '0')}`,
    );
    if (periodEnd < periodStart)
      throw new ConflictError('Payroll period end must be after its start');
    const dates = {
      attendanceFreezeDate: input.attendanceFreezeDate
        ? dateOnly(input.attendanceFreezeDate)
        : null,
      calculationDate: input.calculationDate ? dateOnly(input.calculationDate) : null,
      releaseDate: input.releaseDate ? dateOnly(input.releaseDate) : null,
      salaryCreditDate: input.salaryCreditDate ? dateOnly(input.salaryCreditDate) : null,
    };
    if (dates.attendanceFreezeDate && dates.attendanceFreezeDate > periodEnd)
      throw new ConflictError('Attendance freeze cannot be after the payroll period');
    if (dates.calculationDate && dates.calculationDate < periodStart)
      throw new ConflictError('Calculation date cannot be before the payroll period');
    if (dates.releaseDate && dates.releaseDate < periodStart)
      throw new ConflictError('Release date cannot be before the payroll period');
    if (dates.salaryCreditDate && dates.salaryCreditDate < periodStart)
      throw new ConflictError('Salary credit date cannot be before the payroll period');
    return this.database.run(context, async (tx) => {
      const before = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      const updated = await tx.payrollCalendar.upsert({
        where: {
          organizationId_year_month: {
            organizationId: context.organizationId,
            year: input.year,
            month: input.month,
          },
        },
        create: {
          organizationId: context.organizationId,
          year: input.year,
          month: input.month,
          periodStart,
          periodEnd,
          ...dates,
        },
        update: { periodStart, periodEnd, ...dates },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_CALENDAR',
          entityId: updated.id,
          action: 'PAYROLL_CALENDAR_UPDATED',
          beforeState: jsonSnapshot({ settings: before }),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return {
        payrollFrequency: before.payrollFrequency,
        payrollDayOfMonth: before.payrollDayOfMonth,
        calendar: updated,
      };
    });
  }
}
