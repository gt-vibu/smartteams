import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './api-client';

/**
 * Session continuity across access-token expiry.
 *
 * The access cookie lives fifteen minutes. Before this, the sixteenth minute produced a 401 that
 * surfaced as "Invalid email or password." and lost whatever the person was doing — the refresh
 * endpoint existed on the API and nothing in the browser ever called it.
 */

function response(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiRequest session refresh', () => {
  it('refreshes and replays a request that expired mid-session', async () => {
    let employeeCalls = 0;
    const fetchSpy = mockFetch((url) => {
      if (url.includes('/auth/refresh')) return response(201, { csrfToken: 'new' });
      employeeCalls += 1;
      return employeeCalls === 1
        ? response(401, { detail: 'Unauthorized' })
        : response(200, [{ id: 'employee' }]);
    });

    await expect(apiRequest('/v1/organizations/o/employees', { method: 'GET' })).resolves.toEqual([
      { id: 'employee' },
    ]);
    expect(employeeCalls).toBe(2);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/auth/refresh'))).toBe(true);
  });

  it('refreshes once for a burst of simultaneous expiries', async () => {
    // The API rotates refresh tokens and treats reuse as theft, so a second concurrent refresh
    // would be rejected and would end the session this behaviour exists to preserve.
    let refreshCalls = 0;
    const seen = new Map<string, number>();
    mockFetch((url) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return response(201, {});
      }
      const count = (seen.get(url) ?? 0) + 1;
      seen.set(url, count);
      return count === 1 ? response(401, {}) : response(200, { ok: true });
    });

    await Promise.all([
      apiRequest('/v1/a', { method: 'GET' }),
      apiRequest('/v1/b', { method: 'GET' }),
      apiRequest('/v1/c', { method: 'GET' }),
    ]);

    expect(refreshCalls).toBe(1);
  });

  it('does not try to refresh a failed sign-in', async () => {
    let refreshCalls = 0;
    mockFetch((url) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return response(201, {});
      }
      return response(401, {});
    });

    await expect(
      apiRequest('/v1/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } }),
    ).rejects.toThrow('Invalid email or password.');
    expect(refreshCalls).toBe(0);
  });

  it('surfaces an ended session rather than a credential error when refresh is refused', async () => {
    mockFetch((url) => response(url.includes('/auth/refresh') ? 401 : 401, {}));

    await expect(apiRequest('/v1/organizations/o/employees', { method: 'GET' })).rejects.toThrow(
      'Your session has ended. Please sign in again.',
    );
  });

  it('gives up after one replay rather than looping', async () => {
    let attempts = 0;
    mockFetch((url) => {
      if (url.includes('/auth/refresh')) return response(201, {});
      attempts += 1;
      return response(401, {});
    });

    await expect(apiRequest('/v1/x', { method: 'GET' })).rejects.toBeInstanceOf(ApiError);
    expect(attempts).toBe(2);
  });

  it('leaves other failures alone', async () => {
    mockFetch(() => response(409, { detail: 'That employee number is already in use' }));

    await expect(apiRequest('/v1/x', { method: 'POST', body: {} })).rejects.toThrow(
      'That employee number is already in use',
    );
  });
});

describe('in-flight read deduplication', () => {
  it('collapses simultaneous identical reads into one request', async () => {
    // Six hooks each ask for the employee list, several of them mounting together.
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return response(200, [{ id: 'employee' }]);
    });

    const results = await Promise.all([
      apiRequest('/v1/organizations/o/employees', { method: 'GET' }),
      apiRequest('/v1/organizations/o/employees', { method: 'GET' }),
      apiRequest('/v1/organizations/o/employees', { method: 'GET' }),
    ]);

    expect(calls).toBe(1);
    expect(results[0]).toEqual([{ id: 'employee' }]);
    expect(results[2]).toEqual([{ id: 'employee' }]);
  });

  it('goes to the network again once the previous read has settled', async () => {
    // This is a dedupe, not a cache. A later read must never be served a stale body.
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return response(200, { call: calls });
    });

    await apiRequest('/v1/x', { method: 'GET' });
    await apiRequest('/v1/x', { method: 'GET' });

    expect(calls).toBe(2);
  });

  it('keeps different paths apart', async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return response(200, {});
    });

    await Promise.all([
      apiRequest('/v1/a', { method: 'GET' }),
      apiRequest('/v1/b', { method: 'GET' }),
    ]);

    expect(calls).toBe(2);
  });

  it('never deduplicates a write', async () => {
    // Two identical writes are two intentions, not one — collapsing them would silently drop work.
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return response(201, {});
    });

    await Promise.all([
      apiRequest('/v1/x', { method: 'POST', body: { a: 1 } }),
      apiRequest('/v1/x', { method: 'POST', body: { a: 1 } }),
    ]);

    expect(calls).toBe(2);
  });

  it('releases the entry when a read fails, so a retry is not stuck on the failure', async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return response(calls === 1 ? 500 : 200, {});
    });

    await expect(apiRequest('/v1/x', { method: 'GET' })).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/v1/x', { method: 'GET' })).resolves.toBeDefined();
    expect(calls).toBe(2);
  });

  it('separates reads that differ only by header', async () => {
    // `if-match-version` and friends change what the request means.
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return response(200, {});
    });

    await Promise.all([
      apiRequest('/v1/x', { method: 'GET' }),
      apiRequest('/v1/x', { method: 'GET', headers: { 'if-match-version': '2' } }),
    ]);

    expect(calls).toBe(2);
  });
});
