export interface ApprovedTimesheetNotification {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  totalMinutes: number;
  status: 'APPROVED';
}
