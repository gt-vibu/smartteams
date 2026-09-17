/**
 * Log Time said "The timesheet entry response was not valid." about entries it had saved.
 *
 * Adding an entry has always answered `{ timesheet, entry }`, with the sheet as its stored row. The
 * repository read that reply as a bare timesheet, which it can never be, so every save reported an
 * error — and every retry saved the hours again. The body below is the reply the running API
 * returned, captured on 17 Sept 2026, not a shape written to suit the parser.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { timesheetRepository } from './timesheet.repository';

const ORG = '42247d8b-1ea2-4d9b-a7f3-d4b4b5c4d8fe';
const SHEET = '094bc6df-27db-48cf-87b8-160bec8e74b3';

const liveReply = {
  timesheet: {
    id: SHEET,
    organizationId: ORG,
    timesheetPeriodId: 'bd915f83-b22e-43d3-99e2-f8782f755875',
    employeeId: 'cc737ddb-e871-4c85-8891-6bf59dcb6d4c',
    approvalPolicyId: null,
    branchId: '85cdbe0a-f4d9-40d5-91b7-c1a926ffdb4e',
    status: 'DRAFT',
    totalMinutes: 90,
    regularMinutes: 90,
    overtimeMinutes: 0,
    sourceAccessMode: 'NATIVE',
    externalId: null,
    submittedAt: null,
    approvedAt: null,
    createdAt: '2026-09-17T05:40:48.701Z',
    updatedAt: '2026-09-17T05:40:48.765Z',
    version: 3,
  },
  entry: {
    id: '36da8274-f174-4352-9ee4-944836f806a0',
    organizationId: ORG,
    timesheetId: SHEET,
    attendanceRecordId: null,
    workDate: '2026-09-17T00:00:00.000Z',
    minutes: 90,
    regularMinutes: 90,
    overtimeMinutes: 0,
    source: 'MANUAL',
    description: 'Done',
    createdAt: '2026-09-17T05:40:48.740Z',
    updatedAt: '2026-09-17T05:40:48.740Z',
  },
};

function mockFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => [] },
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adding a time entry', () => {
  it('accepts the reply the API actually sends, on the direct endpoint', async () => {
    mockFetch(201, liveReply);
    const result = await timesheetRepository.addEntry(ORG, undefined, {
      workDate: '2026-09-17',
      minutes: 90,
      description: 'Done',
    });
    expect(result.entry.minutes).toBe(90);
    expect(result.timesheet.id).toBe(SHEET);
  });

  it('and on the per-sheet endpoint', async () => {
    const spy = mockFetch(201, liveReply);
    await timesheetRepository.addEntry(ORG, SHEET, {
      workDate: '2026-09-17',
      minutes: 90,
    });
    expect(String(spy.mock.calls[0]?.[0])).toContain(`/timesheets/${SHEET}/entries`);
  });

  it('still refuses a reply that is not an entry at all', async () => {
    mockFetch(201, { unexpected: true });
    await expect(
      timesheetRepository.addEntry(ORG, undefined, {
        workDate: '2026-09-17',
        minutes: 90,
      }),
    ).rejects.toThrow('The timesheet entry response was not valid.');
  });
});
