import { ApiClientError, isRecord, request, stringValue } from './http-client';

export type FederationEnvironment = 'SANDBOX' | 'STAGING' | 'PRODUCTION';

export interface FederationClient {
  id: string;
  name: string;
  clientId: string;
  environment: FederationEnvironment;
  status: string;
  isActive: boolean;
  mtlsRequired: boolean;
  allowedCertificateFingerprints: string[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

/** Only returned at creation and rotation; the secret is never retrievable afterwards. */
export interface FederationClientSecret extends FederationClient {
  clientSecret: string;
}

export type FederationGrantEffect = 'ALLOW' | 'DENY';

export interface FederationGrantBranch {
  id: string;
  name: string;
  code: string;
  status: string;
}

export interface FederationGrantOrganization {
  id: string;
  name: string;
  externalId: string | null;
  status: string;
  branches: FederationGrantBranch[];
}

export interface FederationGrant {
  id: string;
  organizationId: string;
  organizationName: string;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  effect: FederationGrantEffect;
  scopeCodes: string[];
}

export interface FederationGrantAccess {
  scopes: string[];
  organizations: FederationGrantOrganization[];
  grants: FederationGrant[];
}

export type FederationClientInput = {
  name: string;
  clientId: string;
  environment: FederationEnvironment;
  isActive: boolean;
  mtlsRequired: boolean;
  allowedCertificateFingerprints: string[];
};

const BASE = '/v1/platform/federation-clients';

export async function listFederationClients(): Promise<FederationClient[]> {
  const payload = await request(BASE, { method: 'GET' });
  if (!Array.isArray(payload) || !payload.every(isFederationClient)) {
    throw new ApiClientError('The federation client list was not valid.', 502);
  }
  return payload;
}

export async function createFederationClient(input: FederationClientInput) {
  return expectSecret(await request(BASE, { method: 'POST', body: input }));
}

export async function updateFederationClientCertificates(
  clientId: string,
  input: Pick<FederationClientInput, 'mtlsRequired' | 'allowedCertificateFingerprints'>,
) {
  return expectClient(
    await request(`${BASE}/${encodeURIComponent(clientId)}/certificate-fingerprints`, {
      method: 'PATCH',
      body: input,
    }),
  );
}

export async function rotateFederationClientSecret(clientId: string) {
  return expectSecret(
    await request(`${BASE}/${encodeURIComponent(clientId)}/credentials/rotate`, {
      method: 'POST',
    }),
  );
}

export async function setFederationClientEnabled(clientId: string, enabled: boolean) {
  return expectClient(
    await request(`${BASE}/${encodeURIComponent(clientId)}/${enabled ? 'enable' : 'disable'}`, {
      method: 'PATCH',
    }),
  );
}

export async function deleteFederationClient(clientId: string) {
  const payload = await request(`${BASE}/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
  if (!isRecord(payload) || payload.deleted !== true) {
    throw new ApiClientError('The federation client deletion response was not valid.', 502);
  }
}

export async function listFederationClientGrants(clientId: string): Promise<FederationGrantAccess> {
  const payload = await request(`${BASE}/${encodeURIComponent(clientId)}/grants`, {
    method: 'GET',
  });
  if (!isFederationGrantAccess(payload))
    throw new ApiClientError('The federation grant access response was not valid.', 502);
  return payload;
}

export async function updateFederationClientGrant(
  clientId: string,
  input: { organizationId: string; branchId?: string; scopeCodes: string[] },
) {
  const payload = await request(`${BASE}/${encodeURIComponent(clientId)}/grants`, {
    method: 'PUT',
    body: input,
  });
  if (!isFederationGrantUpdate(payload))
    throw new ApiClientError('The federation grant update response was not valid.', 502);
  return payload;
}

function expectClient(payload: unknown): FederationClient {
  if (!isFederationClient(payload)) {
    throw new ApiClientError('The federation client response was not valid.', 502);
  }
  return payload;
}

function expectSecret(payload: unknown): FederationClientSecret {
  if (
    !isFederationClient(payload) ||
    stringValue((payload as FederationClientSecret).clientSecret) === undefined
  ) {
    throw new ApiClientError('The federation client secret response was not valid.', 502);
  }
  return payload as FederationClientSecret;
}

function isFederationClient(value: unknown): value is FederationClient {
  return (
    isRecord(value) &&
    stringValue(value.id) !== undefined &&
    stringValue(value.name) !== undefined &&
    stringValue(value.clientId) !== undefined &&
    isEnvironment(value.environment) &&
    stringValue(value.status) !== undefined &&
    typeof value.isActive === 'boolean' &&
    typeof value.mtlsRequired === 'boolean' &&
    Array.isArray(value.allowedCertificateFingerprints) &&
    value.allowedCertificateFingerprints.every((item) => typeof item === 'string') &&
    stringValue(value.createdAt) !== undefined &&
    stringValue(value.updatedAt) !== undefined &&
    (value.lastUsedAt === null || stringValue(value.lastUsedAt) !== undefined)
  );
}

function isFederationGrantAccess(value: unknown): value is FederationGrantAccess {
  return (
    isRecord(value) &&
    isStringArray(value.scopes) &&
    Array.isArray(value.organizations) &&
    value.organizations.every(isFederationGrantOrganization) &&
    Array.isArray(value.grants) &&
    value.grants.every(isFederationGrant)
  );
}

function isFederationGrantOrganization(value: unknown): value is FederationGrantOrganization {
  return (
    isRecord(value) &&
    stringValue(value.id) !== undefined &&
    stringValue(value.name) !== undefined &&
    (value.externalId === null || stringValue(value.externalId) !== undefined) &&
    stringValue(value.status) !== undefined &&
    Array.isArray(value.branches) &&
    value.branches.every(isFederationGrantBranch)
  );
}

function isFederationGrantBranch(value: unknown): value is FederationGrantBranch {
  return (
    isRecord(value) &&
    stringValue(value.id) !== undefined &&
    stringValue(value.name) !== undefined &&
    stringValue(value.code) !== undefined &&
    stringValue(value.status) !== undefined
  );
}

function isFederationGrant(value: unknown): value is FederationGrant {
  return (
    isRecord(value) &&
    stringValue(value.id) !== undefined &&
    stringValue(value.organizationId) !== undefined &&
    stringValue(value.organizationName) !== undefined &&
    (value.branchId === null || stringValue(value.branchId) !== undefined) &&
    (value.branchName === null || stringValue(value.branchName) !== undefined) &&
    (value.branchCode === null || stringValue(value.branchCode) !== undefined) &&
    (value.effect === 'ALLOW' || value.effect === 'DENY') &&
    isStringArray(value.scopeCodes)
  );
}

function isFederationGrantUpdate(value: unknown): value is {
  organizationId: string;
  organizationName: string;
  branchId: string | null;
  scopeCodes: string[];
} {
  return (
    isRecord(value) &&
    stringValue(value.organizationId) !== undefined &&
    stringValue(value.organizationName) !== undefined &&
    (value.branchId === null || stringValue(value.branchId) !== undefined) &&
    isStringArray(value.scopeCodes)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isEnvironment(value: unknown): value is FederationEnvironment {
  return value === 'SANDBOX' || value === 'STAGING' || value === 'PRODUCTION';
}
