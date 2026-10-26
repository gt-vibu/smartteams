/**
 * Home's quick links used to decide Approvals on their own ("is the badge an Admin one?"), so an
 * HR Admin saw Approvals in their employee workspace even though the navigation hid it. The links
 * now follow the same module-access rule as the navigation.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewDashboardTab } from './overview-dashboard-tab';

let allowed = new Set<string>();

vi.mock('../../hooks/use-auth', () => ({
  useAuth: () => ({ canAccessModule: (module: string) => allowed.has(module) }),
}));
vi.mock('../../hooks/use-attendance', () => ({ useAttendance: () => ({ days: [] }) }));
vi.mock('../../hooks/use-timesheet', () => ({
  useTimesheet: () => ({
    summary: { totalLabel: '0h', submittedLabel: '0', notSubmittedLabel: '0' },
  }),
}));
vi.mock('../../hooks/use-leave', () => ({ useLeave: () => ({ balances: [], types: [] }) }));
vi.mock('../../hooks/use-my-shift', () => ({
  useMyShift: () => ({ shift: null, loading: false, error: null }),
}));
vi.mock('./project-hours-card', () => ({ ProjectHoursCard: () => null }));

describe('Home quick links', () => {
  it('offers no Approvals to someone who does not approve as themselves (an HR Admin)', () => {
    allowed = new Set(['attendance', 'timesheet', 'time-off']);
    render(<OverviewDashboardTab onNavigateModule={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /approvals/i })).toBeNull();
    expect(screen.getByRole('button', { name: /apply for leave/i })).toBeTruthy();
  });

  it('offers Approvals to a manager with people to approve for', () => {
    allowed = new Set(['attendance', 'timesheet', 'time-off', 'approvals']);
    render(<OverviewDashboardTab onNavigateModule={vi.fn()} />);
    expect(screen.getByRole('button', { name: /approvals/i })).toBeTruthy();
  });

  it('hides links to screens the person cannot open', () => {
    allowed = new Set(['time-off']);
    render(<OverviewDashboardTab onNavigateModule={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /log time/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /attendance/i })).toBeNull();
  });
});
