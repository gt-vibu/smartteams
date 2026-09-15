export interface ShiftInfo {
  id: string;
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
}

export interface WorkScheduleWeek {
  shift: ShiftInfo;
  startDate: string;
  endDate: string;
}
