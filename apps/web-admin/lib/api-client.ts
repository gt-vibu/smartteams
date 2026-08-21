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

export interface OrganizationResult {
  id: string;
  name: string;
  slug: string;
  source: string;
}

export interface FederationClientResult {
  client: { id: string; clientId: string; status: string };
  credential: { id: string; keyId: string; clientSecret: string };
}

export interface FederationGrantResult {
  id: string;
  status: string;
  effect: string;
  startsAt: string;
}

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

export async function createOrganization(
  session: AdminSession,
  input: {
    name: string;
    slug: string;
    timezone: string;
    currencyCode: string;
    externalId?: string;
    reason: string;
  },
) {
  const payload = await request('/v1/organizations', {
    method: 'POST',
    token: session.accessToken,
    body: {
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
      currencyCode: input.currencyCode,
      source: 'BLIZBOOKS',
      ...(input.externalId?.trim() ? { externalId: input.externalId.trim() } : {}),
      reason: input.reason,
    },
  });
  if (!isOrganization(payload))
    throw new ApiClientError('The organization response was not valid.', 502);
  return payload;
}

export async function createFederationClient(
  session: AdminSession,
  input: { name: string; fingerprint: string; homeOrganizationId?: string; reason: string },
) {
  const payload = await request('/v1/platform/federation-clients', {
    method: 'POST',
    token: session.accessToken,
    body: {
      name: input.name,
      mtlsRequired: true,
      allowedCertificateFingerprints: [input.fingerprint],
      homeOrganizationId: input.homeOrganizationId || undefined,
      reason: input.reason,
    },
  });
  if (!isFederationClient(payload))
    throw new ApiClientError('The client response was not valid.', 502);
  return payload;
}

export async function createFederationGrant(
  session: AdminSession,
  input: {
    clientId: string;
    organizationId: string;
    scopes: string[];
    effect: 'ALLOW' | 'DENY';
    startsAt: string;
    endsAt?: string;
    reason: string;
  },
) {
  const payload = await request('/v1/platform/federation-grants', {
    method: 'POST',
    token: session.accessToken,
    body: { ...input, endsAt: input.endsAt || undefined },
  });
  if (!isGrant(payload)) throw new ApiClientError('The grant response was not valid.', 502);
  return payload;
}

async function request(
  path: string,
  options: { method: 'GET' | 'POST'; token?: string; body?: Record<string, unknown> } = {
    method: 'GET',
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
  return isSession(value) && isRecord(value) && stringValue(value.refreshToken) !== undefined;
}

function isOrganization(value: unknown): value is OrganizationResult {
  return (
    isRecord(value) &&
    stringValue(value.id) !== undefined &&
    stringValue(value.name) !== undefined &&
    stringValue(value.slug) !== undefined
  );
}

function isFederationClient(value: unknown): value is FederationClientResult {
  if (!isRecord(value) || !isRecord(value.client) || !isRecord(value.credential)) return false;
  return (
    stringValue(value.client.id) !== undefined &&
    stringValue(value.client.clientId) !== undefined &&
    stringValue(value.credential.clientSecret) !== undefined
  );
}

function isGrant(value: unknown): value is FederationGrantResult {
  return (
    isRecord(value) &&
    stringValue(value.id) !== undefined &&
    stringValue(value.status) !== undefined &&
    stringValue(value.effect) !== undefined &&
    stringValue(value.startsAt) !== undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
