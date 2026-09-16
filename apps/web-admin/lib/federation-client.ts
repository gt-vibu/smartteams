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

function isEnvironment(value: unknown): value is FederationEnvironment {
  return value === 'SANDBOX' || value === 'STAGING' || value === 'PRODUCTION';
}
