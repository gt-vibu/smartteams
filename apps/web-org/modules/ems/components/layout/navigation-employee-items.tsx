import type { NavItem } from './navigation-items';
import { navIcons } from './navigation-icons';

/**
 * What an employee sees: their own work, not the organization's. There is no Shifts entry: an
 * employee's shift is shown on Attendance, and My Space has no shifts screen — the entry opened Home.
 */
export const employeeNavItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: navIcons.home },
  { id: 'time-off', label: 'Leave', icon: navIcons.timeOff },
  { id: 'holidays', label: 'Holidays', icon: navIcons.holidays },
  { id: 'timesheet', label: 'Timesheet', icon: navIcons.timesheet },
  { id: 'attendance', label: 'Attendance', icon: navIcons.attendance },
  { id: 'projects', label: 'Projects', icon: navIcons.projects },
  { id: 'payroll', label: 'Payroll', icon: navIcons.payroll },
  { id: 'approvals', label: 'Approvals', icon: navIcons.approvals },
  { id: 'files', label: 'Files', icon: navIcons.files },
];
