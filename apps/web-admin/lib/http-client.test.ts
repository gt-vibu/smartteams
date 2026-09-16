import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, request } from './http-client';

function mockFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'smarteam_session_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('admin http client', () => {
  it('sends cookies as the credential', async () => {
    const spy = mockFetch(200, {});
    await request('/v1/organizations', { method: 'GET' });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('attaches no Authorization header — no token is held in JavaScript', async () => {
    const spy = mockFetch(200, {});
    await request('/v1/organizations', { method: 'GET' });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('echoes the CSRF cookie on mutations', async () => {
    document.cookie = 'smarteam_session_csrf=token-value';
    const spy = mockFetch(200, {});
    await request('/v1/organizations/onboard', { method: 'POST', body: { name: 'Acme' } });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token-value');
  });

  it('omits the CSRF header on safe methods', async () => {
    document.cookie = 'smarteam_session_csrf=token-value';
    const spy = mockFetch(200, {});
    await request('/v1/organizations', { method: 'GET' });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
  });

  it('maps 401 to a session message without leaking server detail', async () => {
    mockFetch(401, { detail: 'jwt malformed at line 42' });
    await expect(request('/v1/auth/me', { method: 'GET' })).rejects.toThrow(
      'Your session has expired. Sign in again.',
    );
  });

  it('maps 403 to an authorization message', async () => {
    mockFetch(403, { detail: 'Platform database bypass requires an audited operator' });
    await expect(request('/v1/organizations', { method: 'GET' })).rejects.toThrow(
      'You are not authorized to perform this action.',
    );
  });

  it('throws a network error rather than returning fabricated data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(request('/v1/organizations', { method: 'GET' })).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});
