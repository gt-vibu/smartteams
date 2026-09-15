import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AuthenticatedSession } from '@smarteam/contracts';
import { PersonaRepository } from '../repositories/persona.repository';
import { emsStorageAdapter } from '../storage/storage.adapter';
import { canAdministerOrganization } from './authorization.policy';

describe('EMS Client Persistence, Auth Session & Data Recovery Hardening', () => {
  const adminSession: AuthenticatedSession = {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@apex-dynamics.com',
      displayName: 'System Admin',
      identityType: 'NATIVE',
      isActive: true,
      lastLoginAt: '2026-09-08T10:00:00.000Z',
    },
    session: {
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: '33333333-3333-4333-8333-333333333333',
      expiresAt: '2026-09-09T10:00:00.000Z',
    },
    organization: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Apex Dynamics Technologies',
      slug: 'apex-dynamics',
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      locale: 'en-US',
      status: 'ACTIVE',
    },
    memberships: [
      {
        organizationId: '33333333-3333-4333-8333-333333333333',
        name: 'Apex Dynamics Technologies',
        slug: 'apex-dynamics',
        status: 'ACTIVE',
      },
    ],
    roles: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        code: 'ORG_ADMIN',
        name: 'Organization Admin',
        scope: 'ORGANIZATION',
        branchId: null,
      },
    ],
    permissions: [
      'organizations.read',
      'organizations.update',
      'employees.read',
      'employees.write',
      'attendance.read',
      'attendance.write',
      'leave.read',
      'leave.write',
      'payroll.read',
      'payroll.write',
      'timesheets.read',
      'timesheets.write',
    ],
    platform: { isPlatformOperator: false, permissions: [] },
    employee: {
      id: '55555555-5555-4555-8555-555555555555',
      employeeNumber: 'EMP-001',
      branchId: '66666666-6666-4666-8666-666666666666',
    },
  };

  const employeeSession: AuthenticatedSession = {
    user: {
      id: '77777777-7777-4777-8777-777777777777',
      email: 'john.doe@apex-dynamics.com',
      displayName: 'John Doe',
      identityType: 'NATIVE',
      isActive: true,
      lastLoginAt: '2026-09-08T10:00:00.000Z',
    },
    session: {
      id: '88888888-8888-4888-8888-888888888888',
      organizationId: '33333333-3333-4333-8333-333333333333',
      expiresAt: '2026-09-09T10:00:00.000Z',
    },
    organization: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Apex Dynamics Technologies',
      slug: 'apex-dynamics',
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      locale: 'en-US',
      status: 'ACTIVE',
    },
    memberships: [
      {
        organizationId: '33333333-3333-4333-8333-333333333333',
        name: 'Apex Dynamics Technologies',
        slug: 'apex-dynamics',
        status: 'ACTIVE',
      },
    ],
    roles: [
      {
        id: '99999999-9999-4999-8999-999999999999',
        code: 'EMPLOYEE',
        name: 'Standard Employee',
        scope: 'ORGANIZATION',
        branchId: null,
      },
    ],
    permissions: [
      'organizations.read',
      'attendance.read',
      'attendance.write',
      'leave.read',
      'leave.write',
      'timesheets.read',
      'timesheets.write',
    ],
    platform: { isPlatformOperator: false, permissions: [] },
    employee: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      employeeNumber: 'EMP-002',
      branchId: '66666666-6666-4666-8666-666666666666',
    },
  };

  let personaRepo: PersonaRepository;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    personaRepo = new PersonaRepository();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Invariant 1: Empty LocalStorage & SessionStorage Recovery', () => {
    it('restores full persona and workspace context when localStorage is completely empty', () => {
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);

      const persona = personaRepo.forSession(adminSession);

      expect(persona.id).toBe(adminSession.user.id);
      expect(persona.email).toBe('admin@apex-dynamics.com');
      expect(persona.permissions).toEqual(adminSession.permissions);
      expect(persona.canSwitchWorkspace).toBe(true);
      expect(persona.defaultWorkspace).toBe('ADMIN');

      // Without any localStorage entry, workspace context safely defaults to defaultWorkspace
      const workspaceContext = personaRepo.getWorkspaceContext(persona);
      expect(workspaceContext).toBe('ADMIN');
    });

    it('handles employee persona correctly with empty localStorage', () => {
      const persona = personaRepo.forSession(employeeSession);

      expect(persona.id).toBe(employeeSession.user.id);
      expect(persona.canSwitchWorkspace).toBe(false);
      expect(persona.defaultWorkspace).toBe('EMPLOYEE');

      const workspaceContext = personaRepo.getWorkspaceContext(persona);
      expect(workspaceContext).toBe('EMPLOYEE');
    });

    it('safely handles clearing localStorage during an active runtime session', () => {
      const persona = personaRepo.forSession(adminSession);

      // User sets preference
      personaRepo.setWorkspaceContext(persona, 'EMPLOYEE');
      expect(personaRepo.getWorkspaceContext(persona)).toBe('EMPLOYEE');

      // Browser storage wiped
      localStorage.clear();
      sessionStorage.clear();

      // Persona re-evaluates safely without crashing or throwing
      expect(() => personaRepo.getWorkspaceContext(persona)).not.toThrow();
      expect(personaRepo.getWorkspaceContext(persona)).toBe('ADMIN'); // Resets gracefully to authorized default
    });
  });

  describe('Invariant 2: RBAC & Workspace Authorization Enforcement', () => {
    it('prevents an employee from accessing ADMIN workspace even if localStorage is manually manipulated', () => {
      // Attacker attempts to elevate privileges by writing to localStorage
      localStorage.setItem('ems_workspace_context', JSON.stringify('ADMIN'));

      const persona = personaRepo.forSession(employeeSession);

      // Backend policy strictly rejects admin workspace for non-admin permissions
      expect(persona.canSwitchWorkspace).toBe(false);
      expect(persona.defaultWorkspace).toBe('EMPLOYEE');

      // getWorkspaceContext enforces capability check and ignores forged localStorage
      const activeWorkspace = personaRepo.getWorkspaceContext(persona);
      expect(activeWorkspace).toBe('EMPLOYEE');
    });

    it('does not trust client-forged roles or permissions in localStorage', () => {
      // Malicious payload in storage
      localStorage.setItem(
        'user_roles',
        JSON.stringify([{ code: 'SUPER_ADMIN', permissions: ['*'] }]),
      );

      // Session constructed solely from backend AuthenticatedSession
      const persona = personaRepo.forSession(employeeSession);

      expect(persona.roles[0]?.code).toBe('EMPLOYEE');
      expect(persona.permissions).not.toContain('organizations.update');
      expect(persona.permissions).not.toContain('payroll.read');
      expect(canAdministerOrganization(persona.permissions)).toBe(false);
    });

    it('restricts admin without employee identity from switching to employee workspace', () => {
      const pureAdminSession: AuthenticatedSession = {
        ...adminSession,
        employee: null, // Admin with no employee record
      };

      const persona = personaRepo.forSession(pureAdminSession);

      // cannot switch to employee workspace because employee identity is null
      expect(persona.canSwitchWorkspace).toBe(false);
      expect(persona.defaultWorkspace).toBe('ADMIN');
      expect(personaRepo.getWorkspaceContext(persona)).toBe('ADMIN');
    });
  });

  describe('Invariant 3: EmsStorageAdapter Resiliency & Non-Authoritative Preferences', () => {
    it('returns fallback value when reading non-existent or corrupted storage key', () => {
      localStorage.setItem('corrupted_key', 'INVALID_JSON{{{');

      const result = emsStorageAdapter.getItem('corrupted_key', 'SAFE_FALLBACK');
      expect(result).toBe('SAFE_FALLBACK');
    });

    it('gracefully handles private browsing / disabled localStorage exceptions', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError / Access Denied');
      });

      expect(() => {
        const value = emsStorageAdapter.getItem('any_key', 'DEFAULT');
        expect(value).toBe('DEFAULT');
      }).not.toThrow();

      spy.mockRestore();
    });

    it('safely removes preferences without impacting core application data', () => {
      emsStorageAdapter.setItem('ems_theme', 'dark');
      expect(emsStorageAdapter.getItem('ems_theme', 'light')).toBe('dark');

      emsStorageAdapter.removeItem('ems_theme');
      expect(emsStorageAdapter.getItem('ems_theme', 'system')).toBe('system');
    });
  });

  describe('Invariant 4: Backend Tenant Isolation & Identity Reconstruction', () => {
    it('reconstructs tenant context exclusively from session memberships', () => {
      const persona = personaRepo.forSession(adminSession);

      // Identity and active org originate solely from backend session
      expect(persona.id).toBe(adminSession.user.id);
      expect(adminSession.organization?.slug).toBe('apex-dynamics');
      expect(adminSession.memberships[0]?.slug).toBe('apex-dynamics');

      // No cross-tenant identity exists in localStorage
      expect(localStorage.getItem('organizationId')).toBeNull();
      expect(localStorage.getItem('tenantSlug')).toBeNull();
    });
  });
});
