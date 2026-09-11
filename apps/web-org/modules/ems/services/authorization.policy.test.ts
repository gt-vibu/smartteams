import { describe, expect, it } from 'vitest';
import { canAccessModule, canAdministerOrganization } from './authorization.policy';

/**
 * Module visibility, gated on permissions the backend actually grants.
 *
 * Attendance, Leave and Timesheets used to return `true` unconditionally for the employee
 * workspace, regardless of which permissions the caller actually held — so an employee whose
 * role was narrowed to Payroll only would still see every module the API would then reject them
 * from. Payroll checked `payroll.read`, a key no role — seeded or custom — has ever granted,
 * which made the module invisible to every non-wildcard holder in both workspaces, including an
 * employee who could read nothing but their own payslip. These pin both fixes.
 */
describe('canAccessModule', () => {
  it('an employee with only payroll access sees payroll and nothing else', () => {
    const permissions = ['payroll.payslips.read'];
    expect(canAccessModule('payroll', 'EMPLOYEE', permissions, false)).toBe(true);
    expect(canAccessModule('attendance', 'EMPLOYEE', permissions, false)).toBe(false);
    expect(canAccessModule('time-off', 'EMPLOYEE', permissions, false)).toBe(false);
    expect(canAccessModule('timesheet', 'EMPLOYEE', permissions, false)).toBe(false);
  });

  it('an employee with the full self-service bundle sees every self-service module', () => {
    const permissions = ['attendance.read', 'leave.requests.read', 'timesheets.read'];
    expect(canAccessModule('attendance', 'EMPLOYEE', permissions, false)).toBe(true);
    expect(canAccessModule('time-off', 'EMPLOYEE', permissions, false)).toBe(true);
    expect(canAccessModule('timesheet', 'EMPLOYEE', permissions, false)).toBe(true);
    // No payroll permission was granted, so payroll stays absent even though everything else is.
    expect(canAccessModule('payroll', 'EMPLOYEE', permissions, false)).toBe(false);
  });

  it('the tenant wildcard opens every module in both workspaces', () => {
    expect(canAccessModule('payroll', 'EMPLOYEE', ['*'], false)).toBe(true);
    expect(canAccessModule('payroll', 'ADMIN', ['*'], false)).toBe(true);
    expect(canAccessModule('attendance', 'EMPLOYEE', ['*'], false)).toBe(true);
  });

  it('the admin workspace still hides payroll from an administrator with no payroll grant', () => {
    // e.g. an ORG_ADMIN-shaped role that was scoped down to exclude payroll explicitly, holding
    // organizations.read but no payroll.* key at all.
    expect(canAccessModule('payroll', 'ADMIN', ['organizations.read'], false)).toBe(false);
  });

  /*
   * The admin workspace used to answer `true` for every module except payroll, so anyone who
   * could reach the Organization space at all — which needs only `organizations.read` — could
   * deep-link to `?module=attendance` and have the screen render. The API refused the data, so
   * nothing leaked, but the module appeared and reported itself empty instead of being absent.
   * Caught by opening that exact URL as a member holding payroll permissions only.
   */
  it('an admin-space viewer with only payroll access cannot open the other admin modules', () => {
    const permissions = ['organizations.read', 'payroll.payslips.read', 'payroll.preview.read'];
    expect(canAccessModule('payroll', 'ADMIN', permissions, false)).toBe(true);
    expect(canAccessModule('home', 'ADMIN', permissions, false)).toBe(true);
    expect(canAccessModule('attendance', 'ADMIN', permissions, false)).toBe(false);
    expect(canAccessModule('time-off', 'ADMIN', permissions, false)).toBe(false);
    expect(canAccessModule('timesheet', 'ADMIN', permissions, false)).toBe(false);
    expect(canAccessModule('onboarding', 'ADMIN', permissions, false)).toBe(false);
    expect(canAccessModule('files', 'ADMIN', permissions, false)).toBe(false);
  });

  it('an HR-shaped permission set opens the people modules it genuinely covers', () => {
    const permissions = [
      'organizations.read',
      'employees.write',
      'attendance.read.all',
      'leave.requests.read.all',
      'timesheets.read.all',
    ];
    expect(canAccessModule('attendance', 'ADMIN', permissions, false)).toBe(true);
    expect(canAccessModule('time-off', 'ADMIN', permissions, false)).toBe(true);
    expect(canAccessModule('timesheet', 'ADMIN', permissions, false)).toBe(true);
    expect(canAccessModule('onboarding', 'ADMIN', permissions, false)).toBe(true);
    // No payroll grant in that set, so payroll stays shut.
    expect(canAccessModule('payroll', 'ADMIN', permissions, false)).toBe(false);
  });

  it('a module nobody has declared a permission for stays shut rather than opening by default', () => {
    expect(canAccessModule('some-future-module', 'ADMIN', ['*'], false)).toBe(true);
    expect(canAccessModule('some-future-module', 'ADMIN', ['organizations.read'], false)).toBe(
      false,
    );
  });
});

describe('canAdministerOrganization', () => {
  // The seeded EMPLOYEE role, which holds organizations.read so an employee can see the
  // organization's name and its holiday calendar. It must not make them an administrator.
  const employee = [
    'organizations.read',
    'employees.read',
    'attendance.read',
    'leave.requests.read',
    'timesheets.read',
  ];

  it('does not treat a self-service employee as an administrator', () => {
    expect(canAdministerOrganization(employee)).toBe(false);
  });

  it('is not satisfied by organizations.read alone', () => {
    expect(canAdministerOrganization(['organizations.read'])).toBe(false);
  });

  it('treats a manager as an administrator', () => {
    expect(canAdministerOrganization([...employee, 'rbac.read'])).toBe(true);
  });

  it('treats an HR administrator as an administrator', () => {
    expect(canAdministerOrganization([...employee, 'members.read', 'employees.read.all'])).toBe(
      true,
    );
  });

  it('treats the tenant wildcard as an administrator', () => {
    expect(canAdministerOrganization(['*'])).toBe(true);
  });

  it('is false for a person with no permissions at all', () => {
    expect(canAdministerOrganization([])).toBe(false);
  });
});
