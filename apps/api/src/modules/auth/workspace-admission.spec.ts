import type { AuthenticatedSession } from '@smarteam/contracts';

/**
 * Workspace admission rule, mirrored from `web-org`'s `AuthRepository.adopt`.
 *
 * Authentication alone must not open the organization workspace: the session has to be scoped
 * to a tenant. A platform-operator session authenticates against `/me` correctly but reports
 * `organization: null` with no tenant permissions, and admitting it renders an organization
 * workspace for an account that belongs to no organization.
 *
 * This is reachable in practice because cookies ignore ports, so the platform console and the
 * tenant workspace share one cookie jar whenever both are served from `localhost`.
 */
function admits(session: Pick<AuthenticatedSession, 'organization'> | null): boolean {
  return Boolean(session?.organization);
}

const tenantOrganization = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Acme',
  slug: 'acme',
  timezone: 'Asia/Kolkata',
  currencyCode: 'INR',
  locale: 'en-IN',
  status: 'ACTIVE' as const,
};

describe('organization workspace admission', () => {
  it('admits a tenant-scoped session', () => {
    expect(admits({ organization: tenantOrganization })).toBe(true);
  });

  it('refuses a platform-operator session, which carries no organization', () => {
    expect(admits({ organization: null })).toBe(false);
  });

  it('refuses when there is no session at all', () => {
    expect(admits(null)).toBe(false);
  });
});
