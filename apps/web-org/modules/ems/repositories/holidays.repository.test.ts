import { afterEach, describe, expect, it, vi } from 'vitest';
import { holidaysRepository } from './holidays.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const HOLIDAY = '22222222-2222-4222-8222-222222222222';

function holiday(overrides: Record<string, unknown> = {}) {
  return {
    id: HOLIDAY,
    organizationId: ORG,
    branchId: null,
    holidayDate: '2026-01-26',
    name: 'Republic Day',
    isOptional: false,
    isActive: true,
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

describe('holidaysRepository', () => {
  it('requests the tenant-scoped holidays endpoint with credentials', async () => {
    const spy = mockFetch(200, [holiday()]);
    await holidaysRepository.list(ORG);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/v1/organizations/${ORG}/holidays`);
    expect(init.credentials).toBe('include');
  });

  it('sends the year as a server-side date range, not a client filter', async () => {
    const spy = mockFetch(200, []);
    await holidaysRepository.list(ORG, { from: '2026-01-01', to: '2026-12-31' });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain('from=2026-01-01');
    expect(url).toContain('to=2026-12-31');
  });

  it('omits an absent range rather than sending empty parameters', async () => {
    const spy = mockFetch(200, []);
    await holidaysRepository.list(ORG);

    const [url] = spy.mock.calls[0] as [string];
    expect(url).not.toContain('from=');
  });

  it('parses a holiday with its scope and flags', async () => {
    mockFetch(200, [holiday({ branchId: HOLIDAY, isOptional: true })]);
    const [result] = await holidaysRepository.list(ORG);

    expect(result?.branchId).toBe(HOLIDAY);
    expect(result?.isOptional).toBe(true);
  });

  it('returns an empty calendar rather than sample holidays', async () => {
    // An organisation with no holidays charges leave for every working day; the screen must be
    // able to say that truthfully.
    mockFetch(200, []);
    await expect(holidaysRepository.list(ORG)).resolves.toEqual([]);
  });

  it('rejects a holiday whose shape does not match the contract', async () => {
    mockFetch(200, [{ id: 'not-a-uuid', name: 'Republic Day' }]);
    await expect(holidaysRepository.list(ORG)).rejects.toThrow('was not valid');
  });

  it('sends only the name and optional flag on an update', async () => {
    const spy = mockFetch(200, holiday({ name: 'Renamed' }));
    await holidaysRepository.update(ORG, HOLIDAY, { name: 'Renamed', isOptional: true });

    const [, init] = spy.mock.calls[0] as [string, { body: string; method: string }];
    expect(init.method).toBe('PATCH');
    expect(Object.keys(JSON.parse(init.body) as Record<string, unknown>).sort()).toEqual([
      'isOptional',
      'name',
    ]);
  });

  it('url-encodes the holiday id and sends the audited reason when retiring', async () => {
    const spy = mockFetch(200, {});
    await holidaysRepository.deactivate(ORG, 'holiday/../../etc', 'Declared a working day');

    const [url, init] = spy.mock.calls[0] as [string, { body: string }];
    expect(url).not.toContain('holiday/../../etc');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Declared a working day' });
  });

  it('fetches holiday settings', async () => {
    const spy = mockFetch(200, { optionalHolidayAllowance: 3 });
    const res = await holidaysRepository.getSettings(ORG);

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain(`/v1/organizations/${ORG}/holidays/settings`);
    expect(res.optionalHolidayAllowance).toBe(3);
  });

  it('updates holiday allowance settings', async () => {
    const spy = mockFetch(200, { optionalHolidayAllowance: 4 });
    const res = await holidaysRepository.updateSettings(ORG, { optionalHolidayAllowance: 4 });

    const [url, init] = spy.mock.calls[0] as [string, { body: string; method: string }];
    expect(url).toContain(`/v1/organizations/${ORG}/holidays/settings`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ optionalHolidayAllowance: 4 });
    expect(res.optionalHolidayAllowance).toBe(4);
  });

  it('fetches employee holiday summary', async () => {
    const spy = mockFetch(200, {
      year: 2026,
      allowance: 3,
      usedCount: 1,
      remainingCount: 2,
      mandatory: [holiday()],
      optionalPool: [holiday({ id: '33333333-3333-4333-8333-333333333333', isOptional: true })],
      selectedHolidayIds: [],
      selections: [],
    });
    const summary = await holidaysRepository.getMySummary(ORG, '2026');

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain(`/v1/organizations/${ORG}/holidays/my-summary?year=2026`);
    expect(summary.allowance).toBe(3);
    expect(summary.remainingCount).toBe(2);
  });

  it('posts holiday selection', async () => {
    const spy = mockFetch(200, [
      {
        id: '44444444-4444-4444-8444-444444444444',
        organizationId: ORG,
        employeeId: '55555555-5555-4555-8555-555555555555',
        holidayId: HOLIDAY,
        year: 2026,
        status: 'CONFIRMED',
        selectedAt: '2026-09-07T00:00:00.000Z',
        cancelledAt: null,
      },
    ]);
    const selections = await holidaysRepository.selectHolidays(ORG, [HOLIDAY]);

    const [url, init] = spy.mock.calls[0] as [string, { body: string; method: string }];
    expect(url).toContain(`/v1/organizations/${ORG}/holidays/select`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ holidayIds: [HOLIDAY] });
    expect(selections).toHaveLength(1);
  });

  it('posts holiday cancellation', async () => {
    const spy = mockFetch(200, { success: true });
    await holidaysRepository.cancelSelection(ORG, HOLIDAY);

    const [url, init] = spy.mock.calls[0] as [string, { body: string; method: string }];
    expect(url).toContain(`/v1/organizations/${ORG}/holidays/cancel`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ holidayId: HOLIDAY });
  });

  it('lists admin holiday selections with query params', async () => {
    const spy = mockFetch(200, []);
    await holidaysRepository.listSelections(ORG, { year: '2026' });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain(`/v1/organizations/${ORG}/holidays/selections?year=2026`);
  });

  it('propagates a duplicate-date conflict from the API', async () => {
    mockFetch(409, { detail: 'A holiday already exists on that date for this scope' });
    await expect(
      holidaysRepository.create(ORG, { name: 'Duplicate', holidayDate: '2026-01-26' }),
    ).rejects.toThrow();
  });
});
