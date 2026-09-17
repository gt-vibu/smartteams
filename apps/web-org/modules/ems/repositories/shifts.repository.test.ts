import { afterEach, describe, expect, it, vi } from 'vitest';
import { shiftsRepository } from './shifts.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const SHIFT = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';

function shift(overrides: Record<string, unknown> = {}) {
  return {
    id: SHIFT,
    organizationId: ORG,
    branchId: null,
    code: 'GEN',
    name: 'General',
    daysOfWeek: [1, 2, 3, 4, 5],
    startsAt: '09:00',
    endsAt: '18:00',
    crossesMidnight: false,
    breakMinutes: 60,
    isActive: true,
    breakRules: [],
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

describe('shiftsRepository', () => {
  it('requests the tenant-scoped shifts endpoint with credentials', async () => {
    const spy = mockFetch(200, [shift()]);
    await shiftsRepository.list(ORG);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/v1/organizations/${ORG}/shifts`);
    expect(init.credentials).toBe('include');
  });

  it('parses a shift with its working days', async () => {
    mockFetch(200, [shift()]);
    const [result] = await shiftsRepository.list(ORG);

    expect(result?.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(result?.crossesMidnight).toBe(false);
  });

  it('returns an empty list rather than seeding sample shifts', async () => {
    mockFetch(200, []);
    await expect(shiftsRepository.list(ORG)).resolves.toEqual([]);
  });

  it('rejects a shift whose shape does not match the contract', async () => {
    mockFetch(200, [{ id: 'not-a-uuid', code: 'GEN' }]);
    await expect(shiftsRepository.list(ORG)).rejects.toThrow('was not valid');
  });

  it('url-encodes the shift id in a mutation path', async () => {
    const spy = mockFetch(200, {});
    await shiftsRepository.deactivate(ORG, 'shift/../../etc', 'Replaced by the new roster');

    const [url, init] = spy.mock.calls[0] as [string, { body: string }];
    expect(url).not.toContain('shift/../../etc');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Replaced by the new roster' });
  });

  it('posts an assignment under the employee, with its effective dates', async () => {
    const spy = mockFetch(200, {});
    await shiftsRepository.assign(ORG, EMPLOYEE, {
      shiftId: SHIFT,
      startsOn: '2026-09-01',
      endsOn: '2026-12-31',
    });

    const [url, init] = spy.mock.calls[0] as [string, { body: string }];
    expect(url).toContain(`/shifts/employees/${EMPLOYEE}/assignments`);
    expect(JSON.parse(init.body)).toEqual({
      shiftId: SHIFT,
      startsOn: '2026-09-01',
      endsOn: '2026-12-31',
    });
  });
});
