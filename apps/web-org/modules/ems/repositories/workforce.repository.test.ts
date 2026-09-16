import { afterEach, describe, expect, it, vi } from 'vitest';
import { workforceRepository } from './workforce.repository';

const ORG = '11111111-1111-4111-8111-111111111111';

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    organizationId: ORG,
    employeeNumber: 'EMP-001',
    firstName: 'Asha',
    middleName: null,
    lastName: 'Rao',
    preferredName: null,
    workEmail: 'asha@example.test',
    personalEmail: null,
    phone: null,
    identitySource: 'NATIVE',
    externalId: null,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    primaryBranchId: null,
    version: 1,
    ...overrides,
  };
}

function mockFetch(status: number, body: unknown) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => [] },
    json: () => Promise.resolve(body),
  };
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workforceRepository', () => {
  it('requests the tenant-scoped employees endpoint with credentials', async () => {
    const spy = mockFetch(200, [employee()]);
    await workforceRepository.listEmployees(ORG);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/v1/organizations/${ORG}/employees`);
    expect(init.method).toBe('GET');
    // Cookies are the credential; without this the request is anonymous.
    expect(init.credentials).toBe('include');
  });

  it('url-encodes the organization id rather than interpolating it raw', async () => {
    const spy = mockFetch(200, []);
    await workforceRepository.listEmployees('org/../../etc');

    const [url] = spy.mock.calls[0] as [string];
    expect(url).not.toContain('org/../../etc');
    expect(url).toContain(encodeURIComponent('org/../../etc'));
  });

  it('parses a bare array response', async () => {
    mockFetch(200, [employee(), employee({ id: '44444444-4444-4444-8444-444444444444' })]);
    await expect(workforceRepository.listEmployees(ORG)).resolves.toHaveLength(2);
  });

  it('parses a paged envelope response', async () => {
    mockFetch(200, { items: [employee()], nextCursor: null });
    await expect(workforceRepository.listEmployees(ORG)).resolves.toHaveLength(1);
  });

  it('rejects a response whose shape does not match the contract', async () => {
    // A silently-accepted mismatch would render `undefined` through the UI.
    mockFetch(200, [{ id: 'not-a-uuid', firstName: 'Asha' }]);
    await expect(workforceRepository.listEmployees(ORG)).rejects.toThrow('was not valid');
  });

  it('propagates a 403 rather than returning an empty list', async () => {
    mockFetch(403, { detail: 'Forbidden' });
    await expect(workforceRepository.listEmployees(ORG)).rejects.toThrow();
  });

  it('propagates a server failure instead of falling back to fixtures', async () => {
    mockFetch(500, { detail: 'boom' });
    await expect(workforceRepository.listTeams(ORG)).rejects.toThrow();
  });
});

/** The URL of the nth fetch. `mock.calls` is typed from the zero-argument factory below. */
function requestedUrl(spy: { mock: { calls: unknown[][] } }, index: number): string {
  const url = spy.mock.calls[index]?.[0];
  return typeof url === 'string' ? url : '';
}

describe('employee directory paging', () => {
  /** Answers each request from a scripted queue, so a cursor walk can be exercised. */
  function mockPages(pages: Array<{ items: unknown[]; nextCursor?: string }>) {
    let call = 0;
    const spy = vi.fn(() => {
      const body = pages[Math.min(call, pages.length - 1)];
      call += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { getSetCookie: () => [] },
        json: () => Promise.resolve(body),
      });
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('asks for a bounded page rather than the whole tenant', async () => {
    const spy = mockPages([{ items: [employee()] }]);
    await workforceRepository.listEmployees(ORG);

    expect(requestedUrl(spy, 0)).toContain('limit=200');
  });

  it('follows the cursor and returns every page', async () => {
    const spy = mockPages([
      { items: [employee({ id: '11111111-1111-4111-8111-111111111112' })], nextCursor: 'c1' },
      { items: [employee({ id: '11111111-1111-4111-8111-111111111113' })] },
    ]);

    await expect(workforceRepository.listEmployees(ORG)).resolves.toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(requestedUrl(spy, 1)).toContain('cursor=c1');
  });

  it('stops when the API stops offering a cursor', async () => {
    const spy = mockPages([{ items: [employee()] }]);
    await workforceRepository.listEmployees(ORG);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stops at the page cap and says the list is short', async () => {
    // An endless cursor must not become an endless loop in the browser — that would only move
    // the unbounded read from the server to the client.
    mockPages([{ items: [employee()], nextCursor: 'always' }]);

    const result = await workforceRepository.listEmployeePages(ORG);
    expect(result.truncated).toBe(true);
    expect(result.employees).toHaveLength(50);
  });

  it('still accepts a bare array, so an unpaged endpoint keeps working', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { getSetCookie: () => [] },
      json: () => Promise.resolve([employee()]),
    });
    vi.stubGlobal('fetch', spy);

    await expect(workforceRepository.listEmployees(ORG)).resolves.toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
