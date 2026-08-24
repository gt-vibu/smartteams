import { isTenantBootstrapRequest } from './federation-idempotency.interceptor';

describe('federation tenant bootstrap idempotency', () => {
  it('uses the tenant bootstrap transaction instead of tenant-scoped idempotency storage', () => {
    expect(
      isTenantBootstrapRequest({
        method: 'PUT',
        path: '/v1/federation/tenants/blizbooks-tenant-1',
      }),
    ).toBe(true);
  });

  it.each([
    ['POST', '/v1/federation/tenants/blizbooks-tenant-1'],
    ['PUT', '/v1/federation/tenants/blizbooks-tenant-1/branches/branch-1'],
    ['PUT', '/v1/federation/employees/employee-1'],
  ])('keeps normal idempotency for %s %s', (method, path) => {
    expect(isTenantBootstrapRequest({ method, path })).toBe(false);
  });
});
