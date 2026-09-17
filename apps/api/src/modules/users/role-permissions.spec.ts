import { RolePermissionsService } from './role-permissions.service';
import { RbacService } from '../rbac/rbac.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Changing what an existing role may do.
 *
 * The rules pinned here are the ones that keep the change safe: the administrator role is never
 * edited, nobody grants or removes authority they do not hold, nobody locks themselves out of role
 * management, and only permissions the application enforces can be granted.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const ROLE = '22222222-2222-4222-8222-222222222222';

function context(permissions: string[], userId = 'user-1'): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}
const admin = context(['*']);
const reason = 'Managers now see team attendance';

function setup(
  role: { code: string; keys: string[] },
  options: { callerHoldsRole?: boolean } = {},
) {
  const keys = [...role.keys];
  const toRole = () => ({
    id: ROLE,
    organizationId: ORG,
    code: role.code,
    permissions: keys.map((key) => ({ permission: { key } })),
  });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    role: {
      findFirst: jest.fn(() => Promise.resolve(toRole())),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(toRole())),
    },
    userRole: {
      findFirst: jest.fn().mockResolvedValue(options.callerHoldsRole ? { id: 'assignment' } : null),
    },
    permission: {
      upsert: jest.fn((args: { where: { key: string } }) =>
        Promise.resolve({ id: `perm-${args.where.key}`, key: args.where.key }),
      ),
    },
    rolePermission: {
      deleteMany: jest.fn((args: { where: { permission: { key: { in: string[] } } } }) => {
        for (const key of args.where.permission.key.in) keys.splice(keys.indexOf(key), 1);
        return Promise.resolve({ count: 1 });
      }),
      create: jest.fn((args: { data: { permissionId: string } }) => {
        keys.push(args.data.permissionId.replace('perm-', ''));
        return Promise.resolve({});
      }),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new RolePermissionsService(
    database as never,
    audit,
    new RbacService(database as never),
  );
  return { tx, audit, keys, service };
}

describe('replacing a role’s permissions', () => {
  it('adds and removes exactly the difference, audited with the reason', async () => {
    const { tx, audit, keys, service } = setup({
      code: 'MANAGER',
      keys: ['attendance.read', 'leave.requests.decide'],
    });
    await service.replace(admin, ROLE, {
      permissionKeys: ['attendance.read', 'attendance.read.all'],
      reason,
    });

    expect(keys.sort()).toEqual(['attendance.read', 'attendance.read.all']);
    expect(tx.rolePermission.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.rolePermission.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'ROLE_PERMISSIONS_UPDATED',
        reason,
        afterState: expect.objectContaining({
          added: ['attendance.read.all'],
          removed: ['leave.requests.decide'],
        }) as unknown,
      }),
      tx,
    );
  });

  it('changes nothing and records nothing when the set is the same', async () => {
    const { tx, audit, service } = setup({ code: 'MANAGER', keys: ['attendance.read'] });
    await service.replace(admin, ROLE, { permissionKeys: ['attendance.read'], reason });
    expect(tx.rolePermission.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('never edits the Organization Admin role', async () => {
    const { tx, service } = setup({ code: 'ORG_ADMIN', keys: ['*'] });
    await expect(
      service.replace(admin, ROLE, { permissionKeys: ['attendance.read'], reason }),
    ).rejects.toThrow('cannot be edited');
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a permission the application does not use, and the wildcard', async () => {
    const { service } = setup({ code: 'MANAGER', keys: [] });
    await expect(
      service.replace(admin, ROLE, { permissionKeys: ['attendance.approve'], reason }),
    ).rejects.toThrow('not permissions the application uses: attendance.approve');
    await expect(service.replace(admin, ROLE, { permissionKeys: ['*'], reason })).rejects.toThrow(
      'not permissions the application uses: *',
    );
  });

  it('refuses a caller granting what they do not hold', async () => {
    const hr = context(['rbac.write', 'attendance.read']);
    const { tx, service } = setup({ code: 'MANAGER', keys: ['attendance.read'] });
    await expect(
      service.replace(hr, ROLE, {
        permissionKeys: ['attendance.read', 'payroll.runs.release'],
        reason,
      }),
    ).rejects.toThrow('Cannot grant a permission you do not hold: payroll.runs.release');
    expect(tx.rolePermission.create).not.toHaveBeenCalled();
  });

  it('refuses a caller removing what they do not hold', async () => {
    const hr = context(['rbac.write', 'attendance.read']);
    const { tx, service } = setup({
      code: 'PAYROLL',
      keys: ['attendance.read', 'payroll.runs.release'],
    });
    await expect(
      service.replace(hr, ROLE, { permissionKeys: ['attendance.read'], reason }),
    ).rejects.toThrow('Cannot remove a permission you do not hold: payroll.runs.release');
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses removing role management from a role the caller holds', async () => {
    const hr = context(['rbac.write', 'attendance.read']);
    const { tx, service } = setup(
      { code: 'HR_ADMIN', keys: ['rbac.write', 'attendance.read'] },
      { callerHoldsRole: true },
    );
    await expect(
      service.replace(hr, ROLE, { permissionKeys: ['attendance.read'], reason }),
    ).rejects.toThrow('you would lose access to change it back');
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('needs rbac.write and a reason', async () => {
    const { service } = setup({ code: 'MANAGER', keys: [] });
    await expect(
      service.replace(context(['rbac.read']), ROLE, { permissionKeys: [], reason }),
    ).rejects.toThrow('Missing permission: rbac.write');
    await expect(service.replace(admin, ROLE, { permissionKeys: [], reason: ' ' })).rejects.toThrow(
      'requires a reason',
    );
  });
});
