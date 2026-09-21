import type { NavItem } from './navigation-items';
import { navIcons } from './navigation-icons';

/** What an administrator sees in the Organization space. */
export const adminNavItems: NavItem[] = [
  { id: 'home', label: 'Overview', icon: navIcons.building },
  { id: 'employees', label: 'Employees', icon: navIcons.employees },
  { id: 'onboarding', label: 'Onboarding', icon: navIcons.onboarding },
  { id: 'time-off', label: 'Leave', icon: navIcons.timeOff },
  { id: 'attendance', label: 'Attendance', icon: navIcons.attendance },
  // The organization calendar. It used to be reachable only from an Overview shortcut, so an
  // administrator looking for it in the sidebar concluded the screen did not exist.
  { id: 'holidays', label: 'Holidays', icon: navIcons.holidays },
  { id: 'timesheet', label: 'Timesheet', icon: navIcons.timesheet },
  { id: 'teams', label: 'Teams', icon: navIcons.teams },
  { id: 'projects', label: 'Projects', icon: navIcons.projects },
  { id: 'payroll', label: 'Payroll', icon: navIcons.payroll },
  { id: 'approvals', label: 'Approvals', icon: navIcons.approvals },
  { id: 'files', label: 'Files', icon: navIcons.files },
];
