import type { ApprovedTimesheetNotification } from '../types/timesheet.types';

export const mockTimesheetNotification: ApprovedTimesheetNotification = {
  id: 'ts_jul_2026',
  periodStart: '01-Jul-2026',
  periodEnd: '31-Jul-2026',
  totalHours: 4,
  totalMinutes: 0,
  status: 'APPROVED',
};
