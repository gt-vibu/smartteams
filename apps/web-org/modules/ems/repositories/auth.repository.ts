import { emsStorageAdapter } from '../storage/storage.adapter';
import { EMS_STORAGE_KEYS } from '../storage/storage.keys';
import mockUsersFixture from '../data/fixtures/mock-users.json';
import { Persona, AuthSession, WorkspaceContext, ApprovalDomainType } from '../types/auth.types';

const STORAGE_KEY_PERSONA = 'ems_active_persona';
const STORAGE_KEY_AUTH_STATUS = 'ems_auth_status';
const STORAGE_KEY_WORKSPACE = 'ems_workspace_context';

export class LocalAuthRepository {
  private users: Persona[] = mockUsersFixture.map((u: any) => ({
    ...u,
    name: u.displayName,
    badge: u.scenarioTitle || u.jobTitle,
    user: {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      avatarInitials: u.avatarInitials,
      identityType: 'NATIVE',
      isActive: true,
    },
  })) as Persona[];

  getAllPersonas(): Persona[] {
    return this.users;
  }

  isAuthenticated(): boolean {
    return emsStorageAdapter.getItem<boolean>(STORAGE_KEY_AUTH_STATUS, false);
  }

  getCurrentPersona(): Persona {
    const savedId = emsStorageAdapter.getItem<string>(STORAGE_KEY_PERSONA, 'user-040');
    const found = this.users.find((p) => p.id === savedId || p.user?.id === savedId);
    return found || this.users[0]!;
  }

  getWorkspaceContext(): WorkspaceContext {
    const persona = this.getCurrentPersona();
    if (!persona.canSwitchWorkspace) {
      return persona.defaultWorkspace || 'EMPLOYEE';
    }
    return emsStorageAdapter.getItem<WorkspaceContext>(
      STORAGE_KEY_WORKSPACE,
      persona.defaultWorkspace || 'ADMIN',
    );
  }

  setWorkspaceContext(context: WorkspaceContext): WorkspaceContext {
    const persona = this.getCurrentPersona();
    if (!persona.canSwitchWorkspace) {
      return persona.defaultWorkspace || 'EMPLOYEE';
    }
    emsStorageAdapter.setItem(STORAGE_KEY_WORKSPACE, context);
    return context;
  }

  loginWithCredentials(email: string, password?: string): Persona | null {
    const found = this.users.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() ||
        (u.user?.email && u.user.email.toLowerCase() === email.toLowerCase()),
    );

    if (!found) {
      return null;
    }

    // Verify fixture password if provided
    const fixtureUser = (mockUsersFixture as any[]).find(
      (f) => f.id === found.id || f.email === found.email,
    );
    if (password && fixtureUser?.password && fixtureUser.password !== password) {
      return null;
    }

    emsStorageAdapter.setItem(STORAGE_KEY_AUTH_STATUS, true);
    return this.switchPersona(found.id);
  }

  login(personaId: string): Persona {
    emsStorageAdapter.setItem(STORAGE_KEY_AUTH_STATUS, true);
    return this.switchPersona(personaId);
  }

  logout(): void {
    emsStorageAdapter.setItem(STORAGE_KEY_AUTH_STATUS, false);
  }

  switchPersona(personaId: string): Persona {
    const found = this.users.find((p) => p.id === personaId || p.user?.id === personaId);
    if (!found) {
      throw new Error(`Persona not found: ${personaId}`);
    }
    emsStorageAdapter.setItem(STORAGE_KEY_PERSONA, found.id);
    emsStorageAdapter.setItem(STORAGE_KEY_AUTH_STATUS, true);
    emsStorageAdapter.setItem(STORAGE_KEY_WORKSPACE, found.defaultWorkspace || 'EMPLOYEE');

    // Synchronize current employee profile in storage — write to the SAME key
    // that employee.repository.ts reads (EMS_STORAGE_KEYS.EMPLOYEE = 'ems_employee_profile')
    emsStorageAdapter.setItem(EMS_STORAGE_KEYS.EMPLOYEE, {
      id: found.id,
      employeeNumber: found.employeeNumber,
      firstName: found.name.split(' ')[0] || '',
      lastName: found.name.split(' ').slice(1).join(' ') || '',
      workEmail: found.email,
      jobTitle: found.jobTitle,
      department: found.department,
      location: found.branchName,
      avatarUrl: found.avatarUrl,
      joinedDate: '2024-03-15',
      phone: '+91 98765 43210',
      manager: found.managerName
        ? {
            id: found.managerEmployeeId || 'user-009',
            employeeNumber: 'EMP-009',
            firstName: found.managerName.split(' ')[0] || '',
            lastName: found.managerName.split(' ').slice(1).join(' ') || '',
            jobTitle: 'Manager',
            isOnline: true,
          }
        : null,
      departmentMembers: [],
    });

    return found;
  }

  getAuthSession(): AuthSession {
    const persona = this.getCurrentPersona();
    return {
      user: persona.user,
      personaId: persona.id,
      employeeId: persona.id,
      organizationId: 'org_smarteam_01',
      branchId: persona.branchId,
      roles: persona.roles,
      permissions: new Set(persona.permissions),
      workspaceContext: this.getWorkspaceContext(),
    };
  }

  hasPermission(permission: string, persona?: Persona): boolean {
    const p = persona || this.getCurrentPersona();
    const permSet = new Set(p.permissions);
    return permSet.has('*') || permSet.has(permission);
  }

  /** Checks if the persona has the exact permission key — '*' wildcard is NOT expanded.
   *  Use this when '*' should not substitute for domain-specific permissions,
   *  e.g. when gating approval actions in Employee Workspace. */
  hasExplicitPermission(permission: string, persona?: Persona): boolean {
    const p = persona || this.getCurrentPersona();
    return new Set(p.permissions).has(permission);
  }

  hasAnyPermission(permissions: string[], persona?: Persona): boolean {
    const p = persona || this.getCurrentPersona();
    const permSet = new Set(p.permissions);
    if (permSet.has('*')) return true;
    return permissions.some((perm) => permSet.has(perm));
  }

  canApprove(
    domain: ApprovalDomainType,
    resource?: { requesterId?: string; employeeId?: string },
  ): boolean {
    const persona = this.getCurrentPersona();
    const currentUserId = persona.id;
    const workspaceContext = this.getWorkspaceContext();

    // Backend rule: requester CANNOT approve their own request
    if (resource) {
      const requester = resource.requesterId || resource.employeeId;
      if (requester && (requester === currentUserId || requester === persona.employeeNumber)) {
        return false;
      }
    }

    // Check if manager of the requester (always valid regardless of workspace)
    if (resource && resource.employeeId) {
      if (
        persona.directReportEmployeeIds &&
        persona.directReportEmployeeIds.includes(resource.employeeId)
      ) {
        return true;
      }
    }

    // In Employee Workspace: wildcard ('*') alone does NOT grant approval authority.
    // Only explicit approval permissions or direct-report relationships work.
    // (This prevents admins who happen to have '*' from approving in employee context)
    const explicitApprovalPermissions = {
      LEAVE: ['leave.approve'],
      TIMESHEET: ['timesheets.approve'],
      ATTENDANCE_CORRECTION: ['attendance.approve'],
      PAYROLL: ['payroll.approve'],
    };

    if (workspaceContext === 'EMPLOYEE') {
      const perms = explicitApprovalPermissions[domain] || [];
      return perms.some((p) => this.hasPermission(p));
    }

    // In Admin Workspace: full authority check including wildcard
    if (domain === 'LEAVE') {
      return this.hasAnyPermission(['leave.approve', 'leave.write', '*']);
    }
    if (domain === 'TIMESHEET') {
      return this.hasAnyPermission(['timesheets.approve', 'timesheets.write', '*']);
    }
    if (domain === 'ATTENDANCE_CORRECTION') {
      return this.hasAnyPermission(['attendance.approve', 'attendance.write', '*']);
    }
    if (domain === 'PAYROLL') {
      return this.hasAnyPermission(['payroll.approve', 'payroll.write', '*']);
    }

    return false;
  }
}

export const authRepository = new LocalAuthRepository();
