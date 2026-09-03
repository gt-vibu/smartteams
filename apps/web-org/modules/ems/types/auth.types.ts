export type RoleScope = 'ORGANIZATION' | 'BRANCH';
export type WorkspaceContext = 'ADMIN' | 'EMPLOYEE';
export type ApprovalDomainType = 'LEAVE' | 'TIMESHEET' | 'ATTENDANCE_CORRECTION' | 'PAYROLL';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  avatarInitials: string;
  identityType: 'NATIVE' | 'FEDERATED';
  isActive: boolean;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  scope: RoleScope;
  branchId?: string | null;
  permissionKeys: string[];
}

export interface UserRoleAssignment {
  roleId: string;
  role: Role;
  branchId?: string | null;
  startsAt: string;
  endsAt?: string | null;
}

export interface Persona {
  id: string;
  name: string;
  badge: string;
  email: string;
  /**
   * Null unless the session carries it. These used to be filled from a fixture matched on the
   * signed-in email; the components that display them read the employee detail route instead.
   */
  jobTitle: string | null;
  department: string | null;
  branchId: string | null;
  branchName: string | null;
  employeeNumber: string | null;
  avatarInitials: string;
  avatarUrl: string | null;
  user: User;
  roles: Role[];
  permissions: string[];
  assignedTeamIds: string[];
  assignedProjectIds: string[];
  directReportEmployeeIds: string[];
  managerEmployeeId: string | null;
  managerName: string | null;
  scenarioTitle?: string;
  description?: string;
  canSwitchWorkspace?: boolean;
  defaultWorkspace?: WorkspaceContext;
}

export interface AuthSession {
  user: User;
  personaId: string;
  /** Null when the signed-in user has no employee record; never substituted with another id. */
  employeeId: string | null;
  organizationId: string;
  branchId?: string | null;
  roles: Role[];
  permissions: ReadonlySet<string>;
  workspaceContext: WorkspaceContext;
}
