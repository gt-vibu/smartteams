/**
 * Home on a phone shows one subject at a time.
 *
 * Below `lg` the laptop's two columns used to stack, so Home opened as the profile panel, a tab
 * strip and the Activities cards on one scroll, under a second tab bar. These cases pin the phone
 * layout to a single strip and a single section, opening on the profile.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverviewCompact, type CompactSection } from './overview-compact';

// Each section is replaced by a marker: what is under test is which ones are on screen.
vi.mock('./employee-profile-panel', () => ({ EmployeeProfilePanel: () => <p>profile-card</p> }));
vi.mock('./overview-profile-tab', () => ({ OverviewProfileTab: () => <p>profile-details</p> }));
vi.mock('./overview-activities-tab', () => ({ OverviewActivitiesTab: () => <p>activities</p> }));
vi.mock('./overview-approvals-tab', () => ({ OverviewApprovalsTab: () => <p>approvals</p> }));
vi.mock('./overview-dashboard-tab', () => ({ OverviewDashboardTab: () => <p>dashboard</p> }));
vi.mock('./overview-leave-preview-tab', () => ({ OverviewLeavePreviewTab: () => <p>leave</p> }));
vi.mock('./overview-attendance-preview-tab', () => ({
  OverviewAttendancePreviewTab: () => <p>attendance</p>,
}));
vi.mock('./overview-timesheet-preview-tab', () => ({
  OverviewTimesheetPreviewTab: () => <p>timesheets</p>,
}));
vi.mock('../screen-4-calendar/screen-4-calendar', () => ({
  Screen4Calendar: () => <p>calendar</p>,
}));
vi.mock('../layout/botanical-cover', () => ({ BotanicalCover: () => null }));

let explicit = new Set<string>();
vi.mock('../../hooks/use-auth', () => ({
  useAuth: () => ({ hasExplicitPermission: (key: string) => explicit.has(key) }),
}));

beforeEach(() => {
  explicit = new Set();
});

const ALL = ['profile-card', 'activities', 'approvals', 'dashboard', 'leave', 'attendance'];
const onScreen = () => ALL.filter((marker) => screen.queryByText(marker));
const renderAt = (section: CompactSection, onSelectSection = vi.fn()) => {
  render(<OverviewCompact section={section} onSelectSection={onSelectSection} />);
  return onSelectSection;
};

describe('OverviewCompact', () => {
  it('opens Profile as the profile alone — card and details, nothing from another tab', () => {
    renderAt('Profile');
    expect(onScreen()).toEqual(['profile-card']);
    expect(screen.getByText('profile-details')).toBeInTheDocument();
  });

  it('shows Activities without the profile panel above it', () => {
    renderAt('Activities');
    expect(onScreen()).toEqual(['activities']);
  });

  it('has one strip, and it marks the section on screen', () => {
    renderAt('Dashboard');
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true');
    expect(onScreen()).toEqual(['dashboard']);
  });

  it('keeps module previews out of the strip — the bottom bar already opens those', () => {
    renderAt('Profile');
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Profile', 'Activities', 'Dashboard']);
  });

  it('offers Approvals to a manager with decision authority, and to no one else', () => {
    explicit = new Set(['leave.approve']);
    renderAt('Profile');
    expect(screen.getByRole('tab', { name: 'Approvals' })).toBeInTheDocument();
  });

  it('still opens a preview a link names, on its own', () => {
    renderAt('Leave');
    expect(onScreen()).toEqual(['leave']);
  });

  it('reports the tapped section', async () => {
    const onSelect = renderAt('Profile');
    await userEvent.click(screen.getByRole('tab', { name: 'Activities' }));
    expect(onSelect).toHaveBeenCalledWith('Activities');
  });
});
