import { RbacAdminService } from './rbac-admin.service';
import { MembersService } from './members.service';
import { RbacService } from '../rbac/rbac.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * The privilege-escalation boundary on role management.
 *
 * `rbac.write` and `members.write` are ordinary permissions — HR_ADMIN is seeded with both, and
 * neither implies the tenant wildcard. Before this suite, nothing stopped a holder of either from
 * creating a role that carried `*`, assigning an existing wildcard role to anyone (including
 * themselves), or onboarding a new member with one — reaching full ORG_ADMIN from a role that was
 * never meant to grant it. `RbacService.assertGrantable` closes that: a caller may grant only the
 * permissions they already hold. These tests are the proof, not just of the rule holding, but of
 * exactly which call would have let it through beforehand.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const CALLER = '22222222-2222-4222-8222-222222222222';
const TARGET_USER = '33333333-3333-4333-8333-333333333333';
const ROLE = '44444444-4444-4444-8444-444444444444';

function context(permissions: string[], organizationId = ORG): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: CALLER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

function rolePermissions(keys: string[]) {
  return keys.map((key) => ({ permission: { key } }));
}

function setupRbacAdmin(role: { permissions: ReturnType<typeof rolePermissions> } | null) {
  const tx = {
    role: {
      create: jest.fn().mockResolvedValue({ id: ROLE, permissions: [] }),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          role ? { id: ROLE, organizationId: ORG, permissions: role.permissions } : null,
        ),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: TARGET_USER }) },
    userOrganization: { findFirst: jest.fn().mockResolvedValue({ id: 'm', status: 'ACTIVE' }) },
    userRole: { create: jest.fn().mockResolvedValue({ id: 'ur' }) },
    branch: { findFirst: jest.fn() },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn() };
  const rbac = new RbacService(database as never);
  return { tx, service: new RbacAdminService(database as never, audit, rbac) };
}

function setupMembers(
  roles: Array<{ id: string; permissions: ReturnType<typeof rolePermissions> }>,
) {
  const tx = {
    role: {
      findMany: jest.fn().mockResolvedValue(roles.map((r) => ({ ...r, organizationId: ORG }))),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: TARGET_USER, email: 'new@example.test' }),
    },
    userOrganization: { findFirst: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    userRole: { create: jest.fn().mockResolvedValue({ id: 'ur' }) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn() };
  const passwords = {
    normalizeEmail: (e: string) => e.toLowerCase(),
    hashPassword: jest.fn().mockResolvedValue('hash'),
  };
  const rbac = new RbacService(database as never);
  return {
    tx,
    service: new MembersService(database as never, audit, passwords as never, rbac),
  };
}

describe('privilege escalation: creating a role', () => {
  it('an HR_ADMIN-shaped caller cannot create a role carrying the wildcard', async () => {
    const { service } = setupRbacAdmin(null);
    const caller = context(['rbac.write', 'members.write', 'employees.read.all']);
    await expect(
      service.createRole(caller, {
        code: 'BACKDOOR',
        name: 'Backdoor',
        scope: 'ORGANIZATION',
        permissionKeys: ['*'],
      }),
    ).rejects.toThrow(/do not hold/);
  });

  it('cannot create a role carrying a single permission it does not hold either', async () => {
    const { service } = setupRbacAdmin(null);
    const caller = context(['rbac.write']);
    await expect(
      service.createRole(caller, {
        code: 'PAYROLL_SNEAK',
        name: 'Payroll sneak',
        scope: 'ORGANIZATION',
        permissionKeys: ['payroll.release'],
      }),
    ).rejects.toThrow(/do not hold/);
  });

  it('can create a role scoped to permissions it genuinely holds', async () => {
    const { service, tx } = setupRbacAdmin(null);
    const caller = context(['rbac.write', 'payroll.payslips.read']);
    await expect(
      service.createRole(caller, {
        code: 'PAYROLL_VIEWER',
        name: 'Payroll Viewer',
        scope: 'ORGANIZATION',
        permissionKeys: ['payroll.payslips.read'],
      }),
    ).resolves.toMatchObject({ id: ROLE });
    expect(tx.role.create).toHaveBeenCalledTimes(1);
  });

  it('the tenant wildcard holder may create any role, including one carrying the wildcard', async () => {
    const { service, tx } = setupRbacAdmin(null);
    const caller = context(['*']);
    await expect(
      service.createRole(caller, {
        code: 'ANOTHER_ADMIN',
        name: 'Another Admin',
        scope: 'ORGANIZATION',
        permissionKeys: ['*'],
      }),
    ).resolves.toMatchObject({ id: ROLE });
    expect(tx.role.create).toHaveBeenCalledTimes(1);
  });
});

describe('privilege escalation: assigning a role', () => {
  it('an HR_ADMIN-shaped caller cannot assign an existing wildcard role to anyone', async () => {
    const { service, tx } = setupRbacAdmin({ permissions: rolePermissions(['*']) });
    const caller = context(['rbac.write', 'members.write']);
    await expect(service.assign(caller, { userId: TARGET_USER, roleId: ROLE })).rejects.toThrow(
      /do not hold/,
    );
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });

  it('cannot assign that wildcard role to themselves either', async () => {
    const { service, tx } = setupRbacAdmin({ permissions: rolePermissions(['*']) });
    const caller = context(['rbac.write'], ORG);
    await expect(
      // The caller assigns to their own userId — same actor, same organization.
      service.assign(
        { ...caller, actor: { type: 'USER', userId: TARGET_USER } },
        {
          userId: TARGET_USER,
          roleId: ROLE,
        },
      ),
    ).rejects.toThrow(/do not hold/);
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });

  it('can assign a role whose permissions are a subset of what it already holds', async () => {
    const { service, tx } = setupRbacAdmin({
      permissions: rolePermissions(['payroll.payslips.read']),
    });
    const caller = context(['rbac.write', 'payroll.payslips.read']);
    await expect(
      service.assign(caller, { userId: TARGET_USER, roleId: ROLE }),
    ).resolves.toMatchObject({ id: 'ur' });
    expect(tx.userRole.create).toHaveBeenCalledTimes(1);
  });

  it('the tenant wildcard holder may assign any role', async () => {
    const { service, tx } = setupRbacAdmin({ permissions: rolePermissions(['*']) });
    const caller = context(['*']);
    await expect(
      service.assign(caller, { userId: TARGET_USER, roleId: ROLE }),
    ).resolves.toMatchObject({ id: 'ur' });
    expect(tx.userRole.create).toHaveBeenCalledTimes(1);
  });
});

describe('privilege escalation: onboarding a member with roles', () => {
  it('cannot onboard a new member carrying a wildcard role through the members endpoint', async () => {
    const { service, tx } = setupMembers([{ id: ROLE, permissions: rolePermissions(['*']) }]);
    const caller = { ...context(['members.write']), reason: 'add a colleague' };
    await expect(
      service.create(caller, {
        email: 'new@example.test',
        displayName: 'New Person',
        roleIds: [ROLE],
        reason: 'add a colleague',
      }),
    ).rejects.toThrow(/do not hold/);
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });

  it('can onboard a member whose roles stay within the caller’s own authority', async () => {
    const { service } = setupMembers([
      { id: ROLE, permissions: rolePermissions(['payroll.payslips.read']) },
    ]);
    const caller = {
      ...context(['members.write', 'payroll.payslips.read']),
      reason: 'add a colleague',
    };
    await expect(
      service.create(caller, {
        email: 'new@example.test',
        displayName: 'New Person',
        roleIds: [ROLE],
        reason: 'add a colleague',
      }),
    ).resolves.toMatchObject({ email: 'new@example.test' });
  });
});

describe('privilege escalation: tenant boundary on role assignment', () => {
  it('a role from another organization is not found, regardless of the caller’s permissions', async () => {
    // `findFirst` is already scoped by organizationId in the real query; this proves the
    // wildcard guard never gets a chance to run around that scoping, by asserting a role from a
    // foreign tenant simply is not found.
    const { service, tx } = setupRbacAdmin(null);
    const caller = context(['*'], OTHER_ORG);
    await expect(service.assign(caller, { userId: TARGET_USER, roleId: ROLE })).rejects.toThrow(
      'Role',
    );
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });
});
