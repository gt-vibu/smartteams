import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../infrastructure/database/tenant-database.service';
import { evaluateEmployeeWorkingDay } from './working-day-evaluation';

export type NonWorkingDayReason =
  'WEEKLY_OFF' | 'HOLIDAY' | 'ON_LEAVE' | 'BEFORE_JOINING' | 'AFTER_LEAVING';

export type WorkingDayEvaluation = {
  isWorkingDay: boolean;
  expectedMinutes: number;
  reason?: NonWorkingDayReason;
  detail?: string;
};

export type ExpectedHoursResult = {
  totalMinutes: number;
  totalHours: number;
  workingDaysCount: number;
  holidaysCount: number;
  leaveDaysCount: number;
  weeklyOffCount: number;
};

@Injectable()
export class WorkingDayService {
  constructor(private readonly database: TenantDatabaseService) {}
  evaluateDay(
    tx: TenantTransaction,
    organizationId: string,
    employeeId: string,
    dateInput: Date | string,
  ): Promise<WorkingDayEvaluation> {
    return evaluateEmployeeWorkingDay(tx, organizationId, employeeId, dateInput);
  }

  /**
   * Computes expected working hours across a date range dynamically.
   */
  async expectedHours(
    tx: TenantTransaction,
    organizationId: string,
    employeeId: string,
    startDateInput: Date | string,
    endDateInput: Date | string,
  ): Promise<ExpectedHoursResult> {
    const start =
      typeof startDateInput === 'string'
        ? new Date(`${startDateInput.slice(0, 10)}T00:00:00.000Z`)
        : new Date(`${startDateInput.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const end =
      typeof endDateInput === 'string'
        ? new Date(`${endDateInput.slice(0, 10)}T00:00:00.000Z`)
        : new Date(`${endDateInput.toISOString().slice(0, 10)}T00:00:00.000Z`);

    let totalMinutes = 0;
    let workingDaysCount = 0;
    let holidaysCount = 0;
    let leaveDaysCount = 0;
    let weeklyOffCount = 0;

    const curr = new Date(start);
    while (curr <= end) {
      const evaluation = await this.evaluateDay(tx, organizationId, employeeId, curr);
      if (evaluation.isWorkingDay) {
        totalMinutes += evaluation.expectedMinutes;
        workingDaysCount++;
      } else if (evaluation.reason === 'HOLIDAY') {
        holidaysCount++;
      } else if (evaluation.reason === 'ON_LEAVE') {
        leaveDaysCount++;
      } else if (evaluation.reason === 'WEEKLY_OFF') {
        weeklyOffCount++;
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    return {
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      workingDaysCount,
      holidaysCount,
      leaveDaysCount,
      weeklyOffCount,
    };
  }

  /** DomainContext-scoped helper for standalone checks */
  async isWorkingDay(context: DomainContext, employeeId: string, date: Date | string) {
    return this.database.run(context, (tx) =>
      this.evaluateDay(tx, context.organizationId, employeeId, date),
    );
  }

  async calculateExpectedHours(
    context: DomainContext,
    employeeId: string,
    startDate: Date | string,
    endDate: Date | string,
  ) {
    return this.database.run(context, (tx) =>
      this.expectedHours(tx, context.organizationId, employeeId, startDate, endDate),
    );
  }
}
