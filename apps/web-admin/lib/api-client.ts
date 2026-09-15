/**
 * Public surface of the admin console API client.
 *
 * The implementation is split by responsibility — transport, authentication, tenant
 * administration, federation — so no single module owns both credentials and business calls.
 *
 * Two things that used to live here are gone on purpose:
 *  - the offline "local superadmin" fallback, which granted an administrator session whenever
 *    the API call threw, including on a 401 rejection;
 *  - the sessionStorage token store and the fabricated organization fallbacks.
 *
 * Authentication is now HttpOnly cookies plus `GET /v1/auth/me`, and every call either
 * succeeds against the API or throws.
 */
export { ApiClientError } from './http-client';
export {
  platformLogin,
  logout,
  readSession,
  isPlatformOperator,
  type AdminSession,
} from './auth-client';
export {
  listOrganizations,
  onboardOrganization,
  deactivateOrganization,
  type OrganizationSummary,
  type OnboardOrganizationInput,
  type OnboardOrganizationResult,
} from './organizations-client';
export {
  listFederationClients,
  createFederationClient,
  updateFederationClientCertificates,
  rotateFederationClientSecret,
  setFederationClientEnabled,
  deleteFederationClient,
  type FederationClient,
  type FederationClientSecret,
  type FederationClientInput,
  type FederationEnvironment,
} from './federation-client';
