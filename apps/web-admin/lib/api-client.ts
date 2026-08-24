const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);
const SESSION_KEY = 'smarteam.platform.session.v1';

export interface AdminSession {
  accessToken: string;
  userId: string;
  expiresIn: number;
}

interface AuthTokenResponse extends AdminSession {
  refreshToken: string;
}

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

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function readSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? 'null');
    return isSession(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeSession(session: AdminSession) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.sessionStorage.removeItem(SESSION_KEY);
}

export async function platformLogin(email: string, password: string) {
  const payload = await request('/v1/auth/platform-login', {
    method: 'POST',
    body: { email, password },
  });
  if (!isAuthTokenResponse(payload))
    throw new ApiClientError('The login response was not valid.', 502);
  return {
    accessToken: payload.accessToken,
    userId: payload.userId,
    expiresIn: payload.expiresIn,
  } satisfies AdminSession;
}

export async function logout(session: AdminSession) {
  await request('/v1/auth/logout', { method: 'POST', token: session.accessToken });
}

export async function listFederationClients(session: AdminSession) {
  const payload = await request('/v1/platform/federation-clients', {
    method: 'GET',
    token: session.accessToken,
  });
  if (!Array.isArray(payload) || !payload.every(isFederationClient)) {
    throw new ApiClientError('The federation client list was not valid.', 502);
  }
  return payload;
}

export async function createFederationClient(session: AdminSession, input: FederationClientInput) {
  const payload = await request('/v1/platform/federation-clients', {
    method: 'POST',
    token: session.accessToken,
    body: input,
  });
  if (!isFederationClientSecret(payload))
    throw new ApiClientError('The federation client response was not valid.', 502);
  return payload;
}

export async function updateFederationClientCertificates(
  session: AdminSession,
  clientId: string,
  input: Pick<FederationClientInput, 'mtlsRequired' | 'allowedCertificateFingerprints'>,
) {
  const payload = await request(
    `/v1/platform/federation-clients/${encodeURIComponent(clientId)}/certificate-fingerprints`,
    {
      method: 'PATCH',
      token: session.accessToken,
      body: input,
    },
  );
  if (!isFederationClient(payload))
    throw new ApiClientError('The updated federation client response was not valid.', 502);
  return payload;
}

export async function rotateFederationClientSecret(session: AdminSession, clientId: string) {
  const payload = await request(
    `/v1/platform/federation-clients/${encodeURIComponent(clientId)}/credentials/rotate`,
    { method: 'POST', token: session.accessToken },
  );
  if (!isFederationClientSecret(payload))
    throw new ApiClientError('The rotated federation secret response was not valid.', 502);
  return payload;
}

export async function setFederationClientEnabled(
  session: AdminSession,
  clientId: string,
  enabled: boolean,
) {
  const action = enabled ? 'enable' : 'disable';
  const payload = await request(
    `/v1/platform/federation-clients/${encodeURIComponent(clientId)}/${action}`,
    { method: 'PATCH', token: session.accessToken },
  );
  if (!isFederationClient(payload))
    throw new ApiClientError('The federation client status response was not valid.', 502);
  return payload;
}

export async function deleteFederationClient(session: AdminSession, clientId: string) {
  const payload = await request(`/v1/platform/federation-clients/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
    token: session.accessToken,
  });
  if (!isRecord(payload) || payload.deleted !== true) {
    throw new ApiClientError('The federation client deletion response was not valid.', 502);
  }
}

async function request(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    token?: string;
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError(
      'Smarteam could not be reached. Check the API URL and service status.',
      0,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiClientError(getErrorMessage(payload, response.status), response.status);
  return payload;
}

function getErrorMessage(payload: unknown, status: number) {
  if (!isRecord(payload)) return `Request failed with status ${status}.`;
  const detail = stringValue(payload.detail) ?? stringValue(payload.message);
  const nested = isRecord(payload.error) ? stringValue(payload.error.message) : undefined;
  return detail ?? nested ?? `Request failed with status ${status}.`;
}

function isSession(value: unknown): value is AdminSession {
  return (
    isRecord(value) &&
    stringValue(value.accessToken) !== undefined &&
    stringValue(value.userId) !== undefined &&
    typeof value.expiresIn === 'number'
  );
}

function isAuthTokenResponse(value: unknown): value is AuthTokenResponse {
  return (
    isSession(value) && 'refreshToken' in value && stringValue(value.refreshToken) !== undefined
  );
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

function isFederationClientSecret(value: unknown): value is FederationClientSecret {
  return (
    isFederationClient(value) &&
    'clientSecret' in value &&
    stringValue(value.clientSecret) !== undefined
  );
}

function isEnvironment(value: unknown): value is FederationEnvironment {
  return value === 'SANDBOX' || value === 'STAGING' || value === 'PRODUCTION';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
