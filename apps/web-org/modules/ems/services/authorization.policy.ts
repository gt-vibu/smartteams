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
  TIMESHEET: ['timesheets.approve'],
  ATTENDANCE_CORRECTION: ['attendance.approve'],
  PAYROLL: ['payroll.approve'],
};

const ADMIN_APPROVAL_PERMISSIONS: Record<ApprovalDomainType, string[]> = {
  LEAVE: ['leave.approve', 'leave.write'],
  TIMESHEET: ['timesheets.approve', 'timesheets.write'],
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
    if (moduleName === 'payroll') return can(permissions, 'payroll.read');
    return true;
  }
  switch (moduleName) {
    case 'home':
    case 'time-off':
    case 'timesheet':
    case 'attendance':
    case 'projects':
    case 'files':
      return true;
    case 'payroll':
      return can(permissions, 'payroll.read');
    case 'approvals':
      // Wildcard alone is not enough here, for the reason given on `canApprove`.
      return (
        canExplicitly(permissions, 'leave.approve') ||
        canExplicitly(permissions, 'timesheets.approve') ||
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
