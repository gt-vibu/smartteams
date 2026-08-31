import { z } from 'zod';

/**
 * Authentication and authorization contracts shared by the API and both web apps.
 *
 * Security note: nothing in this file carries a credential. Access and refresh tokens are
 * transported exclusively as HttpOnly cookies set by the API and never appear in a response
 * body, so they cannot be read by browser JavaScript or persisted by a client.
 */

/** Header carrying the double-submit CSRF token on cookie-authenticated mutations. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Suffixes appended to `SESSION_COOKIE_NAME` to derive the refresh and CSRF cookie names. */
export const REFRESH_COOKIE_SUFFIX = '_refresh';
export const CSRF_COOKIE_SUFFIX = '_csrf';

/** Path the refresh cookie is scoped to, so it is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/v1/auth';

/** Mirrors the `RoleScope` database enum. */
export const roleScopeSchema = z.enum(['PLATFORM', 'ORGANIZATION', 'BRANCH']);
export const organizationStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']);

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  identityType: z.enum(['NATIVE', 'FEDERATED']),
  isActive: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
});

export const organizationMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  status: organizationStatusSchema,
});

export const activeOrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  timezone: z.string().min(1),
  currencyCode: z.string().length(3),
  locale: z.string().min(1),
  status: organizationStatusSchema,
});

export const assignedRoleSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  scope: roleScopeSchema,
  branchId: z.string().uuid().nullable(),
});

/**
 * Platform authority is a separate trust domain from tenant authority. A tenant `ORG_ADMIN`
 * always reports `isPlatformOperator: false`; only a `UserPlatformRole` assignment sets it.
 */
export const platformAuthoritySchema = z.object({
  isPlatformOperator: z.boolean(),
  permissions: z.array(z.string().min(1)),
});

export const sessionDescriptorSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  expiresAt: z.string().datetime(),
});

/** Response of `GET /v1/auth/me` — the canonical, server-derived authorization context. */
export const authenticatedSessionSchema = z.object({
  user: authenticatedUserSchema,
  session: sessionDescriptorSchema,
  organization: activeOrganizationSchema.nullable(),
  memberships: z.array(organizationMembershipSchema),
  roles: z.array(assignedRoleSchema),
  /** Tenant-scoped permission keys for the active organization. `"*"` never crosses tenants. */
  permissions: z.array(z.string().min(1)),
  platform: platformAuthoritySchema,
  employee: z
    .object({
      id: z.string().uuid(),
      employeeNumber: z.string().min(1),
      branchId: z.string().uuid().nullable(),
    })
    .nullable(),
});

/**
 * Response of a successful `POST /v1/auth/login`. Deliberately minimal: it confirms which
 * identity and tenant the cookies were issued for and hands over the CSRF token. The client
 * must call `GET /v1/auth/me` for the authorization context.
 */
export const loginResultSchema = z.object({
  outcome: z.literal('AUTHENTICATED'),
  userId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  csrfToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

/**
 * Returned when valid credentials belong to a user with more than one active membership.
 * No session is created; the client must re-submit with an explicit `organizationId`.
 */
export const organizationSelectionRequiredSchema = z.object({
  outcome: z.literal('ORGANIZATION_SELECTION_REQUIRED'),
  organizations: z.array(organizationMembershipSchema),
});

export const loginResponseSchema = z.discriminatedUnion('outcome', [
  loginResultSchema,
  organizationSelectionRequiredSchema,
]);

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type OrganizationMembership = z.infer<typeof organizationMembershipSchema>;
export type ActiveOrganization = z.infer<typeof activeOrganizationSchema>;
export type AssignedRole = z.infer<typeof assignedRoleSchema>;
export type PlatformAuthority = z.infer<typeof platformAuthoritySchema>;
export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;
export type LoginResult = z.infer<typeof loginResultSchema>;
export type OrganizationSelectionRequired = z.infer<typeof organizationSelectionRequiredSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * True when the caller holds `permission`, honouring the tenant-scoped `"*"` wildcard.
 *
 * This mirrors the server's `requirePermission`. It exists so the two web apps stop
 * reimplementing permission semantics, but it drives UX only — the API re-derives and
 * re-enforces every check independently.
 */
export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes('*') || permissions.includes(permission);
}

/** True when the caller holds `permission` exactly. `"*"` is NOT expanded. */
export function hasExplicitPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}
