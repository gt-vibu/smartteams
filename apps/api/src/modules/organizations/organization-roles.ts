export const EMPLOYEE_SELF_SERVICE_PERMISSIONS = [
  'organizations.read',
  'employees.read',
  'attendance.read',
  'attendance.write',
  'attendance.corrections.write',
  'attendance.preferences.read',
  'leave.types.read',
  'leave.requests.read',
  'leave.requests.write',
  'leave.balances.read',
  'timesheets.read',
  'timesheets.write',
  'timesheets.submit',
  'payroll.payslips.read',
  'payroll.employee-profile.read',
  'payroll.preview.read',
  'payroll.advances.read',
  'payroll.advances.request',
  'files.read',
  'files.write',
  'teams.read',
  'projects.read',
  'shifts.read',
] as const;

/**
 * A line manager: their own records, plus the ability to decide what their reports send them.
 *
 * PRD FR-11 requires Manager and HR Admin alongside Organization Admin and Employee. Only the
 * first and last were seeded, which left the middle of the permission model — the `.all` versus
 * self-scoped split — untested by any real role and unusable without hand-building one.
 *
 * A manager gets decision permissions, not organization-wide read: approval routing already
 * resolves who reports to them, so breadth comes from the reporting line rather than from a
 * blanket `.all`.
 */
export const MANAGER_PERMISSIONS = [
  ...EMPLOYEE_SELF_SERVICE_PERMISSIONS,
  'leave.requests.decide',
  'attendance.corrections.decide',
  'timesheets.approve',
  'rbac.read',
] as const;

/**
 * HR: the people-operations role. Organization-wide employee, attendance, leave and timesheet
 * access, and the ability to onboard — but no payroll release, no role administration and no
 * organization settings. Those stay with the administrator.
 */
export const HR_ADMIN_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  'employees.read.all',
  'employees.write',
  'employees.branches.write',
  'attendance.read.all',
  'leave.requests.read.all',
  'leave.balances.read.all',
  'leave.balances.adjust',
  'leave.types.write',
  'timesheets.read.all',
  'files.read.all',
  'branches.read',
  'shifts.write',
  'members.read',
  'members.write',
  'rbac.write',
] as const;
