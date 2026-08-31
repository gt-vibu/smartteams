import leaveFixture from './fixtures/leave.json';
import type { LeaveBalanceItem, LeaveApplicationItem } from '../types/leave.types';

export const mockLeaveBalances: LeaveBalanceItem[] = leaveFixture.balances;
export const mockLeaveApplications: LeaveApplicationItem[] =
  leaveFixture.applications as LeaveApplicationItem[];
