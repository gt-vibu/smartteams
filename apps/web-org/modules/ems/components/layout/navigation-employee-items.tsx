import type { NavItem } from './navigation-items';
import { navIcons } from './navigation-icons';

/** What an employee sees: their own work, not the organization's. */
export const employeeNavItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: navIcons.home },
  { id: 'time-off', label: 'Time Off', icon: navIcons.timeOff },
  { id: 'holidays', label: 'Holidays', icon: navIcons.holidays },
  { id: 'timesheet', label: 'Timesheet', icon: navIcons.timesheet },
  { id: 'attendance', label: 'Attendance', icon: navIcons.attendance },
  { id: 'projects', label: 'Projects', icon: navIcons.projects },
  { id: 'payroll', label: 'Payroll', icon: navIcons.payroll },
  { id: 'shifts', label: 'Shifts', icon: navIcons.shifts },
  { id: 'approvals', label: 'Approvals', icon: navIcons.approvals },
  { id: 'files', label: 'Files', icon: navIcons.files },
];
