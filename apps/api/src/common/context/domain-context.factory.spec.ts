import { DomainContextFactory } from './domain-context.factory';
import type { RequestContext, RequestContextStore } from './request-context';
import type { RbacService } from '../../modules/rbac/rbac.service';
import { ForbiddenDomainError } from '../errors/domain-error';
import { requirePermission } from './domain-context';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

/**
 * The route path supplies `:organizationId`, so these tests pin the two checks that stop a
 * caller from steering it: the session must be scoped to that tenant, and the permissions must
 * come from that tenant's role assignments.
 */
function setup(sessionOrganizationId: string | undefined, permissions: string[] = []) {
  const request: RequestContext = {
    requestId: 'request-1',
    correlationId: 'correlation-1',
    accessMode: 'NATIVE',
    actorType: 'USER',
    userId: USER,
    organizationId: sessionOrganizationId,
  };
  const contexts = { require: () => request } as unknown as RequestContextStore;
  const loadOrganizationPermissions = jest.fn().mockResolvedValue(new Set(permissions));
  const rbac = { loadOrganizationPermissions } as unknown as RbacService;
  return { loadOrganizationPermissions, factory: new DomainContextFactory(contexts, rbac) };
}

describe('DomainContextFactory.native — tenant isolation', () => {
  it('allows a tenant A session to act on tenant A', async () => {
    const { factory } = setup(TENANT_A, ['employees.read']);
    const context = await factory.native(USER, TENANT_A);

    expect(context.organizationId).toBe(TENANT_A);
    expect(context.permissions.has('employees.read')).toBe(true);
  });

  it('denies a tenant A session acting on tenant B', async () => {
    const { factory, loadOrganizationPermissions } = setup(TENANT_A, ['*']);

    await expect(factory.native(USER, TENANT_B)).rejects.toThrow(ForbiddenDomainError);
    // Rejected before any permission lookup, so a wildcard in tenant A cannot leak into B.
    expect(loadOrganizationPermissions).not.toHaveBeenCalled();
  });

  it('denies a tenant B session acting on tenant A', async () => {
    const { factory } = setup(TENANT_B, ['*']);
    await expect(factory.native(USER, TENANT_A)).rejects.toThrow(ForbiddenDomainError);
  });

  it('denies a platform session (no tenant scope) from reaching tenant routes', async () => {
    const { factory } = setup(undefined);
    await expect(factory.native(USER, TENANT_A)).rejects.toThrow(ForbiddenDomainError);
  });

  it('produces a context that denies operations when the tenant grants no permissions', async () => {
    const { factory } = setup(TENANT_A, []);
    const context = await factory.native(USER, TENANT_A);

    expect(() => requirePermission(context, 'payroll.read')).toThrow(ForbiddenDomainError);
  });
});

describe('wildcard scoping', () => {
  it('lets the tenant wildcard satisfy any permission inside its own tenant', async () => {
    const { factory } = setup(TENANT_A, ['*']);
    const context = await factory.native(USER, TENANT_A);

    expect(() => requirePermission(context, 'payroll.read')).not.toThrow();
  });

  it('keeps the platform wildcard separate from tenant authority', () => {
    const { factory } = setup(TENANT_A, ['*']);
    const platform = factory.platform(USER, 'audited support access', TENANT_A);

    // The platform context is a distinct access mode reachable only behind PlatformAuthGuard;
    // it is never produced by `native()`, which is what tenant routes call.
    expect(platform.accessMode).toBe('PLATFORM');
    expect(platform.actor.type).toBe('PLATFORM_OPERATOR');
  });
});
