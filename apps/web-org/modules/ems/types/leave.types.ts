export interface LeaveBalanceItem {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  code: string; // "CL", "EL", "SL", "COMP"
  totalEntitlement: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  colorClass: string;
  accentBorder: string;
}

export interface LeaveApplicationItem {
  id: string;
  leaveTypeName: string;
  code: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  reason: string;
  approverName: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'CANCELLED';
  appliedOn: string;
}

export interface ApplyLeaveFormData {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  reason: string;
  teamNotify?: string;
}
