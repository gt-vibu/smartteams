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
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  /** Extra headers, e.g. `if-match-version` for optimistically-concurrent updates. */
  headers?: Record<string, string>;
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
  // Reads are deduplicated while in flight; writes never are.
  if (options.method !== 'GET') return perform(path, options);

  const key = `${path}|${JSON.stringify(options.headers ?? null)}`;
  const existing = inFlightReads.get(key);
  if (existing) return existing;

  const request = perform(path, options).finally(() => {
    inFlightReads.delete(key);
  });
  inFlightReads.set(key, request);
  return request;
}

/**
 * Requests that have been issued but not yet answered.
 *
 * Six different hooks each ask for the employee list, and several mount together, so one page load
 * was fetching the same directory eight times over. Sharing the promise collapses those into one
 * request without introducing a cache — the entry is dropped the moment the response arrives, so
 * nothing here can ever serve stale data or hide a write. A request issued after the previous one
 * settled goes to the network exactly as before.
 */
const inFlightReads = new Map<string, Promise<unknown>>();

async function perform(path: string, options: RequestOptions): Promise<unknown> {
  const response = await send(path, options);

  // The access cookie lives for JWT_ACCESS_TOKEN_TTL_SECONDS — fifteen minutes by default — so
  // any session outlasting that hits a 401 mid-use. The refresh cookie is still valid at that
  // point, and the API will exchange it, so the correct handling is to refresh once and replay
  // rather than to sign the person out of work they are in the middle of.
  //
  // `/auth/refresh` and `/auth/login` are excluded: a 401 from either is the answer, not a
  // recoverable state.
  if (response.status === 401 && isRefreshable(path)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const replayed = await send(path, options);
      return read(replayed, path);
    }
  }

  return read(response, path);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...csrfHeader(options.method),
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Smarteam could not be reached. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
  }
}

async function read(response: Response, path: string): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(errorMessage(payload, response.status, path), response.status);
  return payload;
}

const AUTH_ANSWER_PATHS = ['/v1/auth/login', '/v1/auth/platform-login', '/v1/auth/refresh'];

function isRefreshable(path: string): boolean {
  return !AUTH_ANSWER_PATHS.some((entry) => path.startsWith(entry));
}

/**
 * At most one refresh is ever in flight.
 *
 * A page typically has several resources loading at once, so an expiring token produces a burst
 * of simultaneous 401s. Without this they would each present the same refresh cookie; the API
 * rotates refresh tokens and treats reuse as theft, so the first would succeed and the rest
 * would be rejected — and the rejection is deliberately terminal, which would end the session
 * this code exists to preserve.
 */
let inFlightRefresh: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  inFlightRefresh ??= (async () => {
    try {
      const response = await send('/v1/auth/refresh', { method: 'POST' });
      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared in a microtask so every caller awaiting this attempt observes the same result
      // before a subsequent 401 can start a new one.
      queueMicrotask(() => {
        inFlightRefresh = null;
      });
    }
  })();
  return inFlightRefresh;
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

function errorMessage(payload: unknown, status: number, path: string): string {
  // Only the sign-in routes can mean "those credentials are wrong". Everywhere else a 401 means
  // the session ended — and by the time this runs, a refresh has already been tried and failed.
  if (status === 401)
    return isRefreshable(path)
      ? 'Your session has ended. Please sign in again.'
      : 'Invalid email or password.';
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
