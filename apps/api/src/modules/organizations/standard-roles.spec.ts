import { readFileSync } from 'node:fs';
import type { Prisma } from '../../generated/prisma/client';
import {
  EMPLOYEE_SELF_SERVICE_PERMISSIONS,
  HR_ADMIN_PERMISSIONS,
  MANAGER_PERMISSIONS,
  seedStandardRoles,
} from './organization-roles';

/**
 * Both ways of creating a tenant must produce the same roles.
 *
 * They did not. Platform onboarding seeded EMPLOYEE, MANAGER and HR_ADMIN; self-service
 * registration created only ORG_ADMIN. A tenant that signed itself up had a single wildcard role
 * and nothing to assign a new joiner, so the onboarding form reported that it could not read the
 * Employee role and created employees who could never sign in — while every test kept passing,
 * because they all built their tenant through the platform path.
 *
 * These pin the seeding itself. The two call sites are asserted separately below.
 */

type Captured = { data: Record<string, unknown> };

function fakeTx() {
  const roles: Captured[] = [];
  const grants: Array<{ roleId: string; permissionId: string }> = [];
  const permissions = new Map<string, string>();
  let nextRole = 0;

  const tx = {
    role: {
      create: (args: Captured) => {
        roles.push(args);
        return Promise.resolve({ id: `role-${++nextRole}` });
      },
    },
    permission: {
      upsert: (args: { where: { key: string } }) => {
        const key = args.where.key;
        if (!permissions.has(key)) permissions.set(key, `perm-${permissions.size + 1}`);
        return Promise.resolve({ id: permissions.get(key)! });
      },
    },
    rolePermission: {
      create: (args: { data: { roleId: string; permissionId: string } }) => {
        grants.push(args.data);
        return Promise.resolve({});
      },
    },
  };

  // Only the three delegates the seeder touches are stubbed; the cast is through `unknown`
  // rather than `any` so nothing else on the client is silently assumed to exist.
  return { tx: tx as unknown as Prisma.TransactionClient, roles, grants, permissions };
}

describe('seedStandardRoles', () => {
  it('creates the three non-administrator roles', async () => {
    const { tx, roles } = fakeTx();
    await seedStandardRoles(tx, 'org-1');

    expect(roles.map((r) => r.data.code)).toEqual(['EMPLOYEE', 'MANAGER', 'HR_ADMIN']);
    for (const role of roles) {
      expect(role.data.organizationId).toBe('org-1');
      expect(role.data.scope).toBe('ORGANIZATION');
      expect(role.data.isSystem).toBe(true);
    }
  });

  it('grants each role exactly its own permission set', async () => {
    const { tx, grants } = fakeTx();
    await seedStandardRoles(tx, 'org-1');

    const countFor = (roleId: string) => grants.filter((g) => g.roleId === roleId).length;
    expect(countFor('role-1')).toBe(EMPLOYEE_SELF_SERVICE_PERMISSIONS.length);
    expect(countFor('role-2')).toBe(MANAGER_PERMISSIONS.length);
    expect(countFor('role-3')).toBe(HR_ADMIN_PERMISSIONS.length);
  });

  it('never grants the tenant wildcard', async () => {
    const { tx, permissions } = fakeTx();
    await seedStandardRoles(tx, 'org-1');

    // The wildcard belongs to ORG_ADMIN alone. A seeded role carrying it would hand every new
    // joiner administrative access over the whole tenant.
    expect([...permissions.keys()]).not.toContain('*');
  });

  it('gives the employee role no organization-wide read', () => {
    // `.all` keys are what separate "your own records" from "everyone's". The employee role is
    // the one assigned by default, so a stray `.all` here would expose the whole tenant.
    expect(EMPLOYEE_SELF_SERVICE_PERMISSIONS.filter((k) => k.endsWith('.all'))).toEqual([]);
  });
});

describe('both tenant-creation paths seed the standard roles', () => {
  const read = (path: string) => readFileSync(require.resolve(path), 'utf8');

  it('self-service registration calls the shared seeder', () => {
    expect(read('../auth/auth.registration.service.ts')).toContain('seedStandardRoles(tx,');
  });

  it('platform onboarding calls the shared seeder', () => {
    expect(read('./organization-onboarding.service.ts')).toContain('seedStandardRoles(tx,');
  });
});
