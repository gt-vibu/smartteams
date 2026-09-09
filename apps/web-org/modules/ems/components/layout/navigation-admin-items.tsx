import type { NavItem } from './navigation-items';
import { navIcons } from './navigation-icons';

/** What an administrator sees in the Organization space. */
export const adminNavItems: NavItem[] = [
  { id: 'home', label: 'Overview', icon: navIcons.building },
  { id: 'onboarding', label: 'Onboarding', icon: navIcons.onboarding },
  { id: 'time-off', label: 'Leave', icon: navIcons.timeOff },
  { id: 'attendance', label: 'Attendance', icon: navIcons.attendance },
  { id: 'timesheet', label: 'Timesheet', icon: navIcons.timesheet },
  { id: 'teams', label: 'Teams', icon: navIcons.teams },
  { id: 'projects', label: 'Projects', icon: navIcons.projects },
  { id: 'payroll', label: 'Payroll', icon: navIcons.payroll },
  { id: 'approvals', label: 'Approvals', icon: navIcons.approvals },
  { id: 'files', label: 'Files', icon: navIcons.files },
];
