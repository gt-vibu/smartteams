import { CSRF_COOKIE_SUFFIX, CSRF_HEADER_NAME } from '@smarteam/contracts';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);
const CSRF_COOKIE_NAME = `${process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'smarteam_session'}${CSRF_COOKIE_SUFFIX}`;

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
};

/**
 * Transport for the admin console.
 *
 * The session travels as HttpOnly cookies, so `credentials: 'include'` is what authenticates
 * a request; no token is held in JavaScript and none is attached here. Unsafe methods echo
 * the readable CSRF cookie in the `x-csrf-token` header to satisfy the API's double-submit
 * check.
 *
 * Every failure throws. There is deliberately no fallback that fabricates a result, because a
 * fallback on the authentication or tenant-data path presents fiction as fact.
 */
export async function request(path: string, options: RequestOptions): Promise<unknown> {
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
    throw new ApiClientError(
      'Smarteam could not be reached. Check the API URL and service status.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiClientError(errorMessage(payload, response.status), response.status);
  }
  return payload;
}

function csrfHeader(method: RequestOptions['method']): Record<string, string> {
  if (method === 'GET') return {};
  const token = readCsrfCookie();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

/** The CSRF cookie is intentionally script-readable; it is not a credential on its own. */
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

/** Reads a Problem Details body without surfacing internal diagnostics to the operator. */
function errorMessage(payload: unknown, status: number): string {
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'You are not authorized to perform this action.';
  if (!isRecord(payload)) return `Request failed with status ${status}.`;
  const detail = stringValue(payload.detail) ?? stringValue(payload.message);
  const nested = isRecord(payload.error) ? stringValue(payload.error.message) : undefined;
  return detail ?? nested ?? `Request failed with status ${status}.`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
