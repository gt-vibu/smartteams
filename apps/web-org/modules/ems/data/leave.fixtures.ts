import leaveFixture from './fixtures/leave.json';
import { LeaveBalanceItem, LeaveApplicationItem } from '../types/leave.types';

export const mockLeaveBalances: LeaveBalanceItem[] = leaveFixture.balances as LeaveBalanceItem[];
export const mockLeaveApplications: LeaveApplicationItem[] =
  leaveFixture.applications as LeaveApplicationItem[];
