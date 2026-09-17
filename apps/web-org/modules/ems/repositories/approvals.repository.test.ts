import { afterEach, describe, expect, it, vi } from 'vitest';
import { approvalsRepository } from './approvals.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const POLICY = '22222222-2222-4222-8222-222222222222';
const ROLE = '33333333-3333-4333-8333-333333333333';

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: POLICY,
    organizationId: ORG,
    domain: 'LEAVE',
    code: 'LV-DEF',
    name: 'Leave approvals',
    isDefault: true,
    isActive: true,
    steps: [{ id: ROLE, stepNumber: 1, approverType: 'ROLE', roleId: ROLE, required: true }],
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

describe('approvalsRepository', () => {
  it('requests the tenant-scoped policies endpoint with credentials', async () => {
    const spy = mockFetch(200, [policy()]);
    await approvalsRepository.listPolicies(ORG);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/v1/organizations/${ORG}/approval-policies`);
    expect(init.credentials).toBe('include');
  });

  it('url-encodes the organization id rather than interpolating it raw', async () => {
    const spy = mockFetch(200, []);
    await approvalsRepository.listPolicies('org/../../etc');

    const [url] = spy.mock.calls[0] as [string];
    expect(url).not.toContain('org/../../etc');
  });

  it('parses a policy with its ordered steps', async () => {
    mockFetch(200, [policy()]);
    const [result] = await approvalsRepository.listPolicies(ORG);

    expect(result?.steps[0]?.approverType).toBe('ROLE');
    expect(result?.isDefault).toBe(true);
  });

  it('returns an empty list rather than inventing a default policy', async () => {
    // An organisation with no policy cannot accept leave requests; the screen has to say so.
    mockFetch(200, []);
    await expect(approvalsRepository.listPolicies(ORG)).resolves.toEqual([]);
  });

  it('rejects a policy whose shape does not match the contract', async () => {
    mockFetch(200, [{ id: 'not-a-uuid', domain: 'NOPE' }]);
    await expect(approvalsRepository.listPolicies(ORG)).rejects.toThrow('was not valid');
  });

  it('sends the reason the backend audits when retiring a policy', async () => {
    const spy = mockFetch(200, {});
    await approvalsRepository.deactivatePolicy(ORG, POLICY, 'Superseded by the new matrix');

    const [url, init] = spy.mock.calls[0] as [string, { body: string }];
    expect(url).toContain(`/approval-policies/${POLICY}/deactivate`);
    expect(JSON.parse(init.body)).toEqual({ reason: 'Superseded by the new matrix' });
  });
});
