import { CSRF_COOKIE_SUFFIX, CSRF_HEADER_NAME } from '@smarteam/contracts';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);
const CSRF_COOKIE_NAME = `${process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'smarteam_session'}${CSRF_COOKIE_SUFFIX}`;

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
};

/**
 * Transport for the organization workspace.
 *
 * The session is carried by HttpOnly cookies, so `credentials: 'include'` is what
 * authenticates a request. No access or refresh token is ever held in JavaScript, which means
 * an XSS payload in this app has no session credential to steal.
 *
 * Failures throw. There is no offline fallback: an unreachable API must surface as an error,
 * never as a locally invented identity.
 */
export async function apiRequest(path: string, options: RequestOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...csrfHeader(options.method),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Smarteam could not be reached. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(errorMessage(payload, response.status), response.status);
  return payload;
}

function csrfHeader(method: RequestOptions['method']): Record<string, string> {
  if (method === 'GET') return {};
  const token = readCsrfCookie();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

/** The CSRF cookie is deliberately script-readable; it carries no authority on its own. */
function readCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== CSRF_COOKIE_NAME) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

function errorMessage(payload: unknown, status: number): string {
  if (status === 401) return 'Invalid email or password.';
  if (status === 403) return 'You are not authorized to perform this action.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (isRecord(payload)) {
    const detail = payload.detail ?? payload.message;
    if (typeof detail === 'string' && detail.length > 0) return detail;
  }
  return `Request failed with status ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
