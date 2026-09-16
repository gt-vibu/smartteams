import { ApiClientError, isRecord, request } from './http-client';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  source: 'NATIVE' | 'BLIZBOOKS';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  timezone: string;
  currencyCode: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
  branchCount: number;
  userCount: number;
  adminUser?: {
    id: string;
    email: string;
    displayName: string;
    lastLoginAt: string | null;
  } | null;
}

export interface OnboardOrganizationInput {
  name: string;
  slug: string;
  timezone: string;
  currencyCode: string;
  adminEmail: string;
  adminDisplayName: string;
  reason?: string;
}

export interface OnboardOrganizationResult {
  organization: OrganizationSummary;
  adminUser: { id: string; email: string; displayName: string };
  /** Shown once, immediately after onboarding, and never persisted by the client. */
  temporaryPassword: string;
}

/**
 * Tenant administration. Every call is authorized server-side by `PlatformAuthGuard`.
 *
 * These functions surface failures rather than substituting locally fabricated organizations.
 * A tenant directory that silently invents rows when the API is unreachable is worse than an
 * error: an operator cannot tell which companies actually exist.
 */
export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const payload = await request('/v1/organizations', { method: 'GET' });
  if (!Array.isArray(payload)) {
    throw new ApiClientError('The organization list was not valid.', 502);
  }
  return payload as OrganizationSummary[];
}

export async function onboardOrganization(
  input: OnboardOrganizationInput,
): Promise<OnboardOrganizationResult> {
  const payload = await request('/v1/organizations/onboard', {
    method: 'POST',
    body: { ...input },
  });
  if (!isRecord(payload) || typeof payload.temporaryPassword !== 'string') {
    throw new ApiClientError('The onboarding response was not valid.', 502);
  }
  return payload as unknown as OnboardOrganizationResult;
}

export async function deactivateOrganization(
  organizationId: string,
  reason: string,
): Promise<void> {
  await request(`/v1/organizations/${encodeURIComponent(organizationId)}/deactivate`, {
    method: 'POST',
    body: { reason, toSource: 'NATIVE' },
  });
}
