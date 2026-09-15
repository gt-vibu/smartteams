/**
 * Three things that looked broken on a phone:
 *
 *  - Time Off's status tabs filtered a list that sat below four balance cards, so choosing a tab
 *    changed nothing in view. The filtered list now comes first.
 *  - Home's Work Schedule always said "Not recorded": nothing read the employee's shift. It now
 *    shows the assigned shift, or says plainly that none is assigned.
 *  - "View all" on Upcoming Holidays had no handler. It now opens the holiday calendar.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LeaveRequest } from '@smarteam/contracts';
import { UpcomingHolidaysCard } from './upcoming-holidays-card';
import { WorkScheduleCard } from './work-schedule-card';

const requests = [
  { id: 'r1', status: 'PENDING', leaveTypeId: 't1', requestedDays: 2 },
  { id: 'r2', status: 'APPROVED', leaveTypeId: 't1', requestedDays: 1 },
].map(
  (request, index) =>
    ({
      ...request,
      employeeId: 'e1',
      startDate: `2026-09-2${index}`,
      endDate: `2026-09-2${index}`,
    }) as unknown as LeaveRequest,
);

vi.mock('../../hooks/use-leave', () => ({
  useLeave: () => ({
    requests,
    balances: [
      {
        id: 'b1',
        leaveTypeId: 't1',
        availableAmount: 12,
        usedAmount: 0,
        pendingAmount: 0,
        entitledAmount: 12,
      },
    ],
    types: [],
    typesById: new Map([['t1', { id: 't1', name: 'Earned Leave', code: 'EARNED', paid: true }]]),
    canWrite: true,
    canReadBalances: true,
    hasNoEmployeeRecord: false,
    loading: false,
    forbidden: false,
    error: null,
    saveError: null,
    saving: false,
    refetch: vi.fn(),
    cancel: vi.fn(),
    apply: vi.fn(),
  }),
}));

const { Screen7TimeOff } = await import('../screen-7-timeoff/screen-7-timeoff');

describe('Time Off status tabs', () => {
  it('filters the request list, which sits above the balances', async () => {
    render(<Screen7TimeOff />);
    const list = screen.getByRole('region', { name: 'Leave requests' });
    const balances = screen.getByRole('region', { name: 'Leave balances' });
    // The list the tabs control comes first in the page.
    expect(list.compareDocumentPosition(balances) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(list).getByText('PENDING')).toBeInTheDocument();
    expect(within(list).getByText('APPROVED')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('tab', { name: /Approved/ }));
    expect(within(list).queryByText('PENDING')).not.toBeInTheDocument();
    expect(within(list).getByText('APPROVED')).toBeInTheDocument();
    expect(within(list).getByRole('heading')).toHaveTextContent('Approved requests');
  });
});

describe('Home work schedule', () => {
  const props = { startDate: '08 Sept', endDate: '15 Sept', attendanceDays: [] };

  it("shows the employee's assigned shift and its hours", () => {
    render(
      <WorkScheduleCard
        {...props}
        shift={{ id: 's', code: 'GEN', name: 'General', startsAt: '09:30', endsAt: '18:30' }}
      />,
    );
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('09:30 - 18:30')).toBeInTheDocument();
    expect(screen.queryByText('Not recorded')).not.toBeInTheDocument();
  });

  it('says no shift is assigned, and does not say so while still loading', () => {
    const { rerender } = render(<WorkScheduleCard {...props} shift={null} shiftStatus="loading" />);
    expect(screen.getByText('Loading shift…')).toBeInTheDocument();
    rerender(<WorkScheduleCard {...props} shift={null} shiftStatus="unassigned" />);
    expect(screen.getByText('No shift assigned for today')).toBeInTheDocument();
  });
});

describe('Upcoming holidays', () => {
  it('"View all" opens the holiday calendar', async () => {
    const onViewAll = vi.fn();
    render(<UpcomingHolidaysCard holidays={[]} onViewAll={onViewAll} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'View all' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('offers no dead link when there is nowhere to go', () => {
    render(<UpcomingHolidaysCard holidays={[]} />);
    expect(screen.queryByRole('button', { name: 'View all' })).not.toBeInTheDocument();
  });
});
