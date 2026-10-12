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

/**
 * The catalogue keys that let someone decide each kind of approval — the keys the API's decision
 * routes check. These read `leave.approve`, `attendance.approve` and `payroll.approve`, which are
 * not in the catalogue and are granted to nobody, so a manager holding the real keys was never
 * offered their approvals.
 */
const EXPLICIT_APPROVAL_PERMISSIONS: Record<ApprovalDomainType, string[]> = {
  LEAVE: ['leave.requests.decide'],
  TIMESHEET: ['timesheets.decide'],
  ATTENDANCE_CORRECTION: ['attendance.corrections.decide'],
  PAYROLL: ['payroll.runs.approve'],
};

/**
 * In the Organization workspace the wildcard counts too. The `.write` keys that used to sit here
 * are the permissions every employee holds to act on their own records, not to decide anyone
 * else's.
 */
const ADMIN_APPROVAL_PERMISSIONS = EXPLICIT_APPROVAL_PERMISSIONS;

/** Decisions with a queue somewhere in the product; payroll runs are approved from Payroll. */
export const APPROVAL_DECISION_PERMISSIONS = [
  ...EXPLICIT_APPROVAL_PERMISSIONS.LEAVE,
  ...EXPLICIT_APPROVAL_PERMISSIONS.TIMESHEET,
  ...EXPLICIT_APPROVAL_PERMISSIONS.ATTENDANCE_CORRECTION,
];

/**
 * Whether someone decides approvals as part of their job, as opposed to holding the wildcard.
 * Explicit on purpose, for the reason given on `canApprove`.
 */
export function decidesApprovals(permissions: readonly string[]): boolean {
  return APPROVAL_DECISION_PERMISSIONS.some((permission) => canExplicitly(permissions, permission));
}

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

/** One per tab of the organization payroll screen; any of them makes the screen worth opening. */
const ADMIN_PAYROLL_PERMISSIONS = [
  'payroll.runs.read',
  'payroll.payslips.read.all',
  'payroll.employee-profile.read.all',
  'payroll.components.read',
  'payroll.policy.read',
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
  'org-setup': [
    'branches.read',
    'employees.write',
    'projects.write',
    'teams.write',
    'members.read',
    'rbac.read',
    'organizations.read',
  ],
  onboarding: ['employees.write'],
  employees: ['employees.read.all'],
  attendance: ['attendance.read.all'],
  'time-off': ['leave.requests.read.all'],
  timesheet: ['timesheets.read.all'],
  teams: ['teams.read'],
  projects: ['projects.read'],
  shifts: ['shifts.read'],
  // The admin workspace holiday page is for managing the tenant calendar. A person who can only
  // read organization details must not get a page they cannot administer. Employee self-service
  // holiday visibility remains separately available below.
  holidays: ['organizations.update'],
  // Whoever decides requests needs the inbox even without reading the routing policies (HR).
  approvals: ['approval-policies.read', ...APPROVAL_DECISION_PERMISSIONS],
  files: ['files.read.all'],
  // Each report is held to its own screen's organization-wide read; any one opens the screen.
  reports: [
    'employees.read.all',
    'attendance.read.all',
    'leave.requests.read.all',
    'timesheets.read.all',
  ],
};

/** Admin pages whose main purpose is maintaining a directory or schedule, not read-only review. */
const ADMIN_MANAGEMENT_MODULE_PERMISSIONS: Record<string, readonly [string, string]> = {
  employees: ['employees.read.all', 'employees.write'],
  teams: ['teams.read', 'teams.write'],
  projects: ['projects.read', 'projects.write'],
  shifts: ['shifts.read', 'shifts.write'],
  holidays: ['organizations.read', 'organizations.update'],
};

const ADMIN_SETUP_WRITE_PERMISSIONS = [
  'organizations.update',
  'branches.write',
  'employees.write',
  'projects.write',
  'teams.write',
  'members.write',
  'rbac.write',
  'approval-policies.write',
];

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
// `rbac.read` is not here: the MANAGER role holds it to see role names, and treating it as an
// administrative signal put every manager in the Organization workspace with nothing to do there.
const ORGANIZATION_WIDE_PERMISSIONS = [
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
  // These admin screens are for maintaining organization records. Require both the data read and
  // the corresponding write permission; read-only users should not get a management destination
  // whose primary actions are unavailable. Other operational screens intentionally remain usable
  // in read-only mode for review and reporting.
  const managementPermissions = ADMIN_MANAGEMENT_MODULE_PERMISSIONS[moduleName];
  if (managementPermissions)
    return managementPermissions.every((permission) => can(permissions, permission));
  // Setup is a collection of admin editors. A read-only organization or branch listing does not
  // make the setup destination useful; each individual section still checks its own read/write
  // permissions after this module-level gate.
  if (moduleName === 'org-setup') return canAny(permissions, ADMIN_SETUP_WRITE_PERMISSIONS);
  // The approvals screen is an action queue. Reading policy configuration alone does not grant
  // access to any decision queue, so require at least one actual decision capability.
  if (moduleName === 'approvals') return canAny(permissions, APPROVAL_DECISION_PERMISSIONS);
  // Organization payroll needs something organization-wide. The self-service keys every
  // employee holds (their own payslip, their own salary) opened it before, onto tabs that each
  // then refused.
  if (moduleName === 'payroll') return canAny(permissions, ADMIN_PAYROLL_PERMISSIONS);
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
  /** Decides approvals as themselves (a manager, a named approver, covering someone). */
  approvesInOwnRight = false,
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
      // In their own workspace, only someone who approves as themselves. An HR or administrator
      // role reaches the organization's approvals from the admin workspace instead.
      return approvesInOwnRight;
    case 'teams':
      return isAssignedToAnyTeam;
    case 'onboarding':
      return false;
    default:
      return false;
  }
}

/**
 * What the organization workspace is called for this person, and the label under their name.
 *
 * "Admin" belongs to someone who administers the whole tenant. An HR Admin runs people
 * operations from the same workspace but is not the company's administrator, and seeing "Admin
 * workspace" and "Tenant Admin" read as if they had been handed everything.
 */
export function workspaceTitle(persona: {
  permissions: readonly string[];
  roles: ReadonlyArray<{ code: string; name: string }>;
}): { workspace: string; badge: string } {
  if (persona.permissions.includes('*'))
    return { workspace: 'Admin workspace', badge: 'Tenant Admin' };
  if (persona.roles.some((role) => role.code === 'HR_ADMIN'))
    return { workspace: 'HR workspace', badge: 'HR Admin' };
  const role = persona.roles.find((entry) => !['EMPLOYEE', 'MANAGER'].includes(entry.code));
  return role
    ? { workspace: `${role.name} workspace`, badge: role.name }
    : { workspace: 'Admin workspace', badge: 'Admin' };
}
