import { describe, expect, it } from 'vitest';
import type { LeaveRequest, LeaveType } from '@smarteam/contracts';
import { approvedLeaveByDate } from './leave-calendar';

const types = [{ id: 't1', name: 'Casual Leave' }] as unknown as LeaveType[];
const request = (status: string, startDate: string, endDate: string) =>
  ({ status, startDate, endDate, leaveTypeId: 't1' }) as unknown as LeaveRequest;

describe('approvedLeaveByDate', () => {
  it('marks every day of an approved leave with its type', () => {
    const map = approvedLeaveByDate([request('APPROVED', '2026-09-29', '2026-10-01')], types);
    expect([...map.keys()]).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(map.get('2026-09-30')).toBe('Casual Leave');
  });

  it('ignores leave that is pending, rejected or cancelled', () => {
    const map = approvedLeaveByDate(
      [
        request('PENDING', '2026-09-01', '2026-09-01'),
        request('REJECTED', '2026-09-02', '2026-09-02'),
        request('CANCELLED', '2026-09-03', '2026-09-03'),
      ],
      types,
    );
    expect(map.size).toBe(0);
  });
});
