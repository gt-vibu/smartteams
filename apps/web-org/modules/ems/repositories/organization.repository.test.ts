import { afterEach, describe, expect, it, vi } from 'vitest';
import { organizationRepository } from './organization.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';

function organization(overrides: Record<string, unknown> = {}) {
  return {
    id: ORG,
    name: 'Smarteam',
    slug: 'smarteam',
    source: 'NATIVE',
    externalId: null,
    status: 'ACTIVE',
    timezone: 'Asia/Kolkata',
    currencyCode: 'INR',
    locale: 'en-IN',
    version: 3,
    ...overrides,
  };
}

function branch(overrides: Record<string, unknown> = {}) {
  return {
    id: BRANCH,
    organizationId: ORG,
    name: 'HQ',
    code: 'HQ',
    status: 'ACTIVE',
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

describe('organizationRepository', () => {
  it('reads the organization from its tenant-scoped path with credentials', async () => {
    const spy = mockFetch(200, organization());
    await organizationRepository.get(ORG);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/v1/organizations/${ORG}`);
    expect(init.credentials).toBe('include');
  });

  it('sends only the three fields the API accepts', async () => {
    const spy = mockFetch(200, organization({ name: 'Renamed' }));
    await organizationRepository.update(ORG, {
      name: 'Renamed',
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
    });

    const [, init] = spy.mock.calls[0] as [string, { body: string; method: string }];
    expect(init.method).toBe('PATCH');
    expect(Object.keys(JSON.parse(init.body) as Record<string, unknown>).sort()).toEqual([
      'currencyCode',
      'name',
      'timezone',
    ]);
  });

  it('returns the organization the server stored, not the value that was sent', async () => {
    mockFetch(200, organization({ name: 'Server wins', version: 4 }));
    const result = await organizationRepository.update(ORG, { name: 'Client guess' });

    expect(result.name).toBe('Server wins');
    expect(result.version).toBe(4);
  });

  it('rejects an organization whose shape does not match the contract', async () => {
    mockFetch(200, { id: 'not-a-uuid' });
    await expect(organizationRepository.get(ORG)).rejects.toThrow('was not valid');
  });

  it('returns an empty branch list rather than sample branches', async () => {
    mockFetch(200, []);
    await expect(organizationRepository.listBranches(ORG)).resolves.toEqual([]);
  });

  it('parses a branch with the status the API reports', async () => {
    mockFetch(200, [branch({ status: 'DEACTIVATED' })]);
    const [result] = await organizationRepository.listBranches(ORG);

    expect(result?.status).toBe('DEACTIVATED');
  });

  it('url-encodes the branch id and sends the audited reason when retiring', async () => {
    const spy = mockFetch(200, {});
    await organizationRepository.deactivateBranch(ORG, 'branch/../../etc', 'Site closed');

    const [url, init] = spy.mock.calls[0] as [string, { body: string }];
    expect(url).not.toContain('branch/../../etc');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Site closed' });
  });
});
