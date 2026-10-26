/**
 * Three things that looked broken on a phone:
 *
 *  - Time Off's status tabs filtered a list that sat below four balance cards, so choosing a tab
 *    changed nothing in view. The filtered list now comes first.
 *  - Home's Work Schedule always said "Not recorded": nothing read the employee's shift. It now
 *    shows the assigned shift, or says plainly that none is assigned.
 *  - "View all" on Upcoming Holidays had no handler. It now opens the holiday calendar.
 */
import type { LeaveRequest } from '@smarteam/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpcomingHolidaysCard } from './upcoming-holidays-card';
import { WorkScheduleCard } from './work-schedule-card';

const requests = [
  {
    id: 'r1',
    status: 'PENDING',
    leaveTypeId: 't1',
    requestedDays: 2,
    startDate: '2026-12-10',
    endDate: '2026-12-11',
  },
  {
    id: 'r2',
    status: 'APPROVED',
    leaveTypeId: 't1',
    requestedDays: 1,
    startDate: '2026-11-23',
    endDate: '2026-11-24',
  },
].map((request) => ({ ...request, employeeId: 'e1' }) as unknown as LeaveRequest);

// The team calendar loads its own data; this test is about the request list and balances.
vi.mock('../screen-7-timeoff/team-leave-calendar', () => ({ TeamLeaveCalendar: () => null }));
vi.mock('../screen-7-timeoff/leave-extras-panel', () => ({ LeaveExtrasPanel: () => null }));
vi.mock('../screen-7-timeoff/apply-leave-modal', () => ({ ApplyLeaveModal: () => null }));

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

describe('Employee leave tabs', () => {
  it('separates balances and request history, and balance cards open matching history', async () => {
    render(<Screen7TimeOff />);
    screen.getByRole('region', { name: 'Leave balances' });
    expect(screen.queryByRole('region', { name: 'Leave request history' })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /Earned Leave balance/ }));
    const history = screen.getByRole('region', { name: 'Leave request history' });
    expect(within(history).getByText('December 2026')).toBeInTheDocument();
    expect(within(history).getByText('November 2026')).toBeInTheDocument();
    expect(within(history).getByRole('heading')).toHaveTextContent('Request history');
  });

  it('shows each status filter in history and groups requests by their start month', async () => {
    render(<Screen7TimeOff />);
    await userEvent.setup().click(screen.getByRole('tab', { name: /History/ }));
    const list = screen.getByRole('region', { name: 'Leave request history' });
    const filter = screen.getByRole('combobox', { name: 'Filter leave requests by status' });

    expect(within(filter).getAllByRole('option')).toHaveLength(5);
    expect(within(filter).getByRole('option', { name: 'Rejected (0)' })).toBeInTheDocument();
    expect(within(filter).getByRole('option', { name: 'Cancelled (0)' })).toBeInTheDocument();

    expect(within(list).getByText('December 2026')).toBeInTheDocument();
    expect(within(list).getByText('November 2026')).toBeInTheDocument();
    const dateCell = within(list).getByText('10 Dec 2026').closest('td');
    expect(dateCell).toHaveClass('leave-date-range-start');
    expect(within(dateCell!).getByText(/11 Dec 2026/)).toHaveClass('leave-date-range-end');
    expect(
      within(list)
        .getByText('December 2026')
        .compareDocumentPosition(within(list).getByText('November 2026')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.setup().selectOptions(filter, 'APPROVED');
    expect(within(list).queryByText('December 2026')).not.toBeInTheDocument();
    expect(within(list).getByText('November 2026')).toBeInTheDocument();
    expect(screen.queryByText('Who’s off')).not.toBeInTheDocument();
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
