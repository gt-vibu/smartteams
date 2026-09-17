import { RbacService } from './rbac.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';

function setup(options: { membership: boolean; permissionKeys?: string[] }) {
  const userRole = {
    findMany: jest.fn().mockResolvedValue(
      (options.permissionKeys ?? []).map((key) => ({
        role: { permissions: [{ permission: { key } }] },
      })),
    ),
  };
  const tx = {
    userOrganization: {
      findFirst: jest.fn().mockResolvedValue(options.membership ? { id: 'membership-1' } : null),
    },
    userRole,
  };
  const database = {
    run: jest.fn((_context: unknown, callback: (client: unknown) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  return { userRole, service: new RbacService(database as never) };
}

describe('RbacService.loadOrganizationPermissions', () => {
  it('resolves permissions for an active member', async () => {
    const { service } = setup({ membership: true, permissionKeys: ['payroll.read', 'leave.read'] });
    const permissions = await service.loadOrganizationPermissions(USER, ORG);

    expect([...permissions].sort()).toEqual(['leave.read', 'payroll.read']);
  });

  it('returns no permissions when the membership is not active, even if roles remain', async () => {
    // A user removed from an organization can still have open UserRole rows; reading roles
    // alone would leave them fully authorized.
    const { service, userRole } = setup({ membership: false, permissionKeys: ['*'] });
    const permissions = await service.loadOrganizationPermissions(USER, ORG);

    expect(permissions.size).toBe(0);
    expect(userRole.findMany).not.toHaveBeenCalled();
  });

  it('denies an asserted permission once membership is revoked', async () => {
    const { service } = setup({ membership: false, permissionKeys: ['*'] });
    await expect(service.assertOrganizationPermission(USER, ORG, 'payroll.read')).rejects.toThrow(
      'Missing permission: payroll.read',
    );
  });
});

describe('RbacService.hasPermission', () => {
  const context = (permissions: string[]) => ({
    organizationId: ORG,
    userId: USER,
    permissions: new Set(permissions),
  });

  it('grants an explicitly held permission', () => {
    const { service } = setup({ membership: true });
    expect(service.hasPermission(context(['payroll.read']), 'payroll.read')).toBe(true);
  });

  it('expands the tenant wildcard', () => {
    const { service } = setup({ membership: true });
    expect(service.hasPermission(context(['*']), 'payroll.write')).toBe(true);
  });

  it('denies a permission the caller does not hold', () => {
    const { service } = setup({ membership: true });
    expect(service.hasPermission(context(['leave.read']), 'payroll.read')).toBe(false);
  });
});
