import { hasPermission, hasExplicitPermission } from '@smarteam/contracts';
import type { ApprovalDomainType, WorkspaceContext } from '../types/auth.types';

/**
 * Client-side authorization policy — presentation only.
 *
 * Every rule here decides what to *render*. None of it is a security boundary: the API
 * re-derives the caller's permissions from the database and re-checks them on every request,
 * so a user who edits this state in devtools gains nothing but a broken screen.
 *
 * The permission semantics deliberately reuse the shared helpers from `@smarteam/contracts`
 * rather than being re-implemented, so the wildcard behaves the same way here as it does in
 * the API's `requirePermission`.
 */

const EXPLICIT_APPROVAL_PERMISSIONS: Record<ApprovalDomainType, string[]> = {
  LEAVE: ['leave.approve'],
  TIMESHEET: ['timesheets.decide'],
  ATTENDANCE_CORRECTION: ['attendance.approve'],
  PAYROLL: ['payroll.approve'],
};

const ADMIN_APPROVAL_PERMISSIONS: Record<ApprovalDomainType, string[]> = {
  LEAVE: ['leave.approve', 'leave.write'],
  TIMESHEET: ['timesheets.decide', 'timesheets.write'],
  ATTENDANCE_CORRECTION: ['attendance.approve', 'attendance.write'],
  PAYROLL: ['payroll.approve', 'payroll.write'],
};

export function can(permissions: readonly string[], permission: string): boolean {
  return hasPermission(permissions, permission);
}

export function canExplicitly(permissions: readonly string[], permission: string): boolean {
  return hasExplicitPermission(permissions, permission);
}

export function canAny(permissions: readonly string[], candidates: readonly string[]): boolean {
  return candidates.some((candidate) => hasPermission(permissions, candidate));
}

export type ApprovalSubject = {
  currentUserId: string;
  directReportEmployeeIds: readonly string[];
  workspaceContext: WorkspaceContext;
  permissions: readonly string[];
};

/**
 * Whether the approve action should be offered.
 *
 * In the employee workspace the tenant wildcard is deliberately *not* expanded: an
 * administrator acting as an employee should not silently gain approval authority over their
 * own team's requests. In the admin workspace the wildcard applies as normal.
 */
/**
 * Whether the caller holds any real permission that makes the Payroll module worth opening.
 *
 * `payroll.read` reads like the obvious gate and is not a permission the backend has ever
 * granted — no role, seeded or custom, produces it, so checking it left Payroll invisible to
 * every non-wildcard holder in both workspaces, including an employee whose only access is their
 * own payslip. These are the keys `requirePermission` actually enforces on the payroll routes;
 * holding any one of them means there is something in the module for this caller to see.
 */
const PAYROLL_MODULE_PERMISSIONS = [
  'payroll.payslips.read',
  'payroll.employee-profile.read',
  'payroll.preview.read',
  'payroll.advances.read',
  'payroll.runs.read',
  'payroll.ledger.read',
];

function canOpenPayroll(permissions: readonly string[]): boolean {
  return canAny(permissions, PAYROLL_MODULE_PERMISSIONS);
}

/**
 * What each administrative module needs before it is worth opening.
 *
 * The admin workspace used to answer `true` for everything except payroll, so any principal who
 * could reach the Organization space at all — which needs only `organizations.read` — could open
 * Attendance, Leave, Timesheets and the rest. The API refused the data, so nothing leaked, but
 * the module rendered and reported itself empty rather than being absent: precisely the
 * "navigate, then discover a 403" experience module visibility exists to prevent.
 *
 * The keys below are the ones the corresponding services actually enforce. An administrative
 * screen shows the organization's records rather than the viewer's own, so the read it needs is
 * the `.all` variant wherever the API draws that distinction.
 */
const ADMIN_MODULE_PERMISSIONS: Record<string, string[]> = {
  home: ['organizations.read'],
  onboarding: ['employees.write'],
  attendance: ['attendance.read.all'],
  'time-off': ['leave.requests.read.all'],
  timesheet: ['timesheets.read.all'],
  teams: ['teams.read'],
  projects: ['projects.read'],
  shifts: ['shifts.read'],
  // Holidays are part of the organization record: reading is `organizations.read`, editing is
  // `organizations.update`. Viewing the screen only requires the former.
  holidays: ['organizations.read'],
  approvals: ['approval-policies.read'],
  files: ['files.read.all'],
};

/**
 * The permissions that mean "this person acts on the organization", not just on their own record.
 *
 * `organizations.read` is deliberately absent, and that absence is the whole point: the seeded
 * EMPLOYEE role holds it — an employee needs it to see the organization's name and its holidays —
 * so treating it as the administrative signal classified every single employee as an
 * administrator and dropped them into the Organization workspace on first sign-in.
 *
 * `rbac.read` is where the seeded roles actually divide: EMPLOYEE is below it, MANAGER, HR_ADMIN
 * and ORG_ADMIN are at or above it. Drawing the line here corrects the employee case without
 * moving anybody else, which is why it is drawn here rather than somewhere tidier.
 */
const ORGANIZATION_WIDE_PERMISSIONS = [
  'rbac.read',
  'rbac.write',
  'members.read',
  'members.write',
  'employees.read.all',
  'employees.write',
  'attendance.read.all',
  'leave.requests.read.all',
  'timesheets.read.all',
  'files.read.all',
  'approval-policies.read',
];

/**
 * Whether this person belongs in the Organization workspace at all.
 *
 * Governs which workspace they land in and whether the workspace switcher is offered. The
 * backend is still the boundary for every individual screen; this only decides which of the two
 * workspaces is theirs.
 */
export function canAdministerOrganization(permissions: readonly string[]): boolean {
  return can(permissions, '*') || canAny(permissions, ORGANIZATION_WIDE_PERMISSIONS);
}

function canOpenAdminModule(moduleName: string, permissions: readonly string[]): boolean {
  // The tenant wildcard opens everything, including a module added after this map was written.
  // `hasPermission` expands `*` for every other check in the product, and an ORG_ADMIN locked
  // out of a new screen by an omission here would be a bug, not a safeguard — they can grant
  // themselves any named permission anyway.
  if (can(permissions, '*')) return true;
  if (moduleName === 'payroll') return canOpenPayroll(permissions);
  const required = ADMIN_MODULE_PERMISSIONS[moduleName];
  // Anyone short of the wildcard needs the module to say what it requires. An unlisted module
  // stays shut rather than inheriting the old blanket `true`.
  if (!required) return false;
  return canAny(permissions, required);
}

export function canApprove(
  subject: ApprovalSubject,
  domain: ApprovalDomainType,
  resource?: { requesterId?: string; employeeId?: string },
): boolean {
  const requester = resource?.requesterId ?? resource?.employeeId;
  // Nobody approves their own request; the API enforces the same rule.
  if (requester && requester === subject.currentUserId) return false;

  if (resource?.employeeId && subject.directReportEmployeeIds.includes(resource.employeeId)) {
    return true;
  }
  if (subject.workspaceContext === 'EMPLOYEE') {
    return EXPLICIT_APPROVAL_PERMISSIONS[domain].some((permission) =>
      canExplicitly(subject.permissions, permission),
    );
  }
  return canAny(subject.permissions, ADMIN_APPROVAL_PERMISSIONS[domain]);
}

/** Which workspace modules are worth rendering for this permission set. */
export function canAccessModule(
  moduleName: string,
  workspaceContext: WorkspaceContext,
  permissions: readonly string[],
  isAssignedToAnyTeam: boolean,
): boolean {
  if (workspaceContext === 'ADMIN') {
    return canOpenAdminModule(moduleName, permissions);
  }
  switch (moduleName) {
    case 'home':
    case 'projects':
    case 'files':
    case 'holidays':
      return true;
    case 'attendance':
      return can(permissions, 'attendance.read');
    case 'time-off':
      return can(permissions, 'leave.requests.read');
    case 'timesheet':
      return can(permissions, 'timesheets.read');
    case 'payroll':
      return canOpenPayroll(permissions);
    case 'approvals':
      // Wildcard alone is not enough here, for the reason given on `canApprove`.
      return (
        canExplicitly(permissions, 'leave.approve') ||
        canExplicitly(permissions, 'timesheets.decide') ||
        canExplicitly(permissions, 'attendance.approve')
      );
    case 'teams':
      return isAssignedToAnyTeam;
    case 'onboarding':
      return false;
    default:
      return false;
  }
}
