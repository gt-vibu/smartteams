import { TimesheetsService } from './timesheets.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Timesheet derivation.
 *
 * This path had no test at all, which is how it kept a per-employee loop issuing roughly
 * twenty-three sequential queries each — an upsert, a delete, one insert per attendance record
 * and an update — inside a single open transaction. At ten thousand employees that is a couple of
 * hundred thousand statements holding locks, and it does not finish.
 *
 * The assertions below are about *shape* as much as output: the query count must not grow with
 * headcount, because that is the property that was missing.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const PERIOD = '22222222-2222-4222-8222-222222222222';

function context(permissions: string[] = ['*']): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

function setup(employeeCount: number, recordsPerEmployee: number) {
  const employees = Array.from({ length: employeeCount }, (_, i) => ({
    id: `employee-${i}`,
    primaryBranchId: null,
  }));
  const records = employees.flatMap((employee, e) =>
    Array.from({ length: recordsPerEmployee }, (_, r) => ({
      id: `record-${e}-${r}`,
      employeeId: employee.id,
      branchId: null,
      workDate: new Date('2026-09-01T00:00:00.000Z'),
      workedMinutes: 480,
      overtimeMinutes: r === 0 ? 60 : 0,
    })),
  );

  const calls: string[] = [];
  const track = <T>(name: string, value: T) => {
    calls.push(name);
    return Promise.resolve(value);
  };

  const sheets = employees.map((employee, i) => ({ id: `sheet-${i}`, employeeId: employee.id }));
  let timesheetReads = 0;

  const tx = {
    timesheetPeriod: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          id: PERIOD,
          status: 'DRAFT',
          periodStart: new Date('2026-09-01'),
          periodEnd: new Date('2026-09-30'),
        }),
      ),
    },
    employee: { findMany: jest.fn(() => track('employee.findMany', employees)) },
    attendanceRecord: { findMany: jest.fn(() => track('attendance.findMany', records)) },
    timesheet: {
      findMany: jest.fn(() => {
        timesheetReads += 1;
        // First read finds nothing (nothing derived yet); later reads return the created sheets.
        return track('timesheet.findMany', timesheetReads === 1 ? [] : sheets);
      }),
      createMany: jest.fn((args: { data: unknown[] }) =>
        track('timesheet.createMany', { count: args.data.length }),
      ),
      updateMany: jest.fn((args: { data: Record<string, unknown> }) =>
        track(`timesheet.updateMany:${Object.keys(args.data).join(',')}`, { count: 0 }),
      ),
      upsert: jest.fn(() => track('timesheet.upsert', {})),
      update: jest.fn(() => track('timesheet.update', {})),
    },
    timesheetEntry: {
      deleteMany: jest.fn((args: { where: { source: string } }) => {
        void args;
        return track('entry.deleteMany', { count: 0 });
      }),
      createMany: jest.fn((args: { data: unknown[] }) =>
        track('entry.createMany', { count: args.data.length }),
      ),
      // Totals are summed from the sheet's own entries so manual ones are not dropped. That is
      // one statement for the whole period, not one per employee, which is what these tests
      // actually guard.
      findMany: jest.fn(() => track('entry.findMany', [])),
      create: jest.fn(() => track('entry.create', {})),
    },
    // Deriving invalidates any calculated run over the period. Tracked like every other statement
    // so the counts below still prove it is one statement for the period, not one per employee.
    payrollRun: {
      updateMany: jest.fn(() => track('payrollRun.updateMany', { count: 0 })),
    },
    // Deriving opens a new approval cycle, so the previous cycle's rows are cleared. Tracked so
    // the counts below prove that is one statement for the period, not one per sheet.
    timesheetApproval: {
      deleteMany: jest.fn(
        (args: { where: { organizationId: string; timesheetId: { in: string[] } } }) => {
          void args;
          return track('approval.deleteMany', { count: 0 });
        },
      ),
    },
  };

  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const service = new TimesheetsService(database as never, { record: jest.fn() }, {
    publish: jest.fn(),
  } as never);
  return { calls, service, tx };
}

describe('timesheet derivation', () => {
  it('issues no statement per employee', async () => {
    const { calls, service } = setup(200, 20);
    await service.derive(context(), PERIOD);

    // The old shape produced one upsert and one update for every employee.
    expect(calls.filter((c) => c === 'timesheet.upsert')).toHaveLength(0);
    expect(calls.filter((c) => c === 'timesheet.update')).toHaveLength(0);
  });

  it('issues no statement per attendance record', async () => {
    const { calls, service } = setup(200, 20);
    await service.derive(context(), PERIOD);

    // 4,000 records previously meant 4,000 inserts.
    expect(calls.filter((c) => c === 'entry.create')).toHaveLength(0);
    expect(calls.filter((c) => c === 'entry.createMany')).toHaveLength(1);
    // One invalidation for the whole period.
    expect(calls.filter((c) => c === 'payrollRun.updateMany')).toHaveLength(1);
    // One approval-cycle reset for the whole period.
    expect(calls.filter((c) => c === 'approval.deleteMany')).toHaveLength(1);
  });

  it('keeps the statement count flat as the tenant grows', async () => {
    const small = setup(10, 5);
    await small.service.derive(context(), PERIOD);
    const large = setup(5_000, 20);
    await large.service.derive(context(), PERIOD);

    // Totals are grouped by their figures, so a wider tenant adds at most a few update
    // statements — not one per employee.
    expect(large.calls.length).toBeLessThanOrEqual(small.calls.length + 4);
  });

  it('writes one entry per attendance record, with overtime split out', async () => {
    const { service, tx } = setup(3, 4);
    await service.derive(context(), PERIOD);

    const [call] = tx.timesheetEntry.createMany.mock.calls as [
      { data: Array<{ minutes: number; regularMinutes: number; overtimeMinutes: number }> },
    ][];
    expect(call?.[0].data).toHaveLength(12);
    const withOvertime = call?.[0].data.filter((entry) => entry.overtimeMinutes > 0) ?? [];
    expect(withOvertime).toHaveLength(3);
    expect(withOvertime[0]?.regularMinutes).toBe(420);
  });

  it('creates a sheet only for employees that do not have one', async () => {
    const { service, tx } = setup(5, 1);
    await service.derive(context(), PERIOD);

    const [call] = tx.timesheet.createMany.mock.calls as [{ data: unknown[] }][];
    expect(call?.[0].data).toHaveLength(5);
  });

  it('resets the period to draft and bumps the version, as the upsert did', async () => {
    const { calls, service } = setup(4, 2);
    await service.derive(context(), PERIOD);

    expect(
      calls.some((c) => c.startsWith('timesheet.updateMany:status,submittedAt,approvedAt,version')),
    ).toBe(true);
  });

  it('opens a fresh approval cycle rather than leaving the previous one attached', async () => {
    const { tx, service } = setup(4, 2);
    await service.derive(context(), PERIOD);

    // The status reset alone is not enough: the sheet keeps the previous cycle's approval rows and
    // timestamps, and `@@unique([timesheetId, approverUserId])` then stops the same approver from
    // deciding again. Both halves of the reset are pinned here.
    const [reset] = tx.timesheet.updateMany.mock.calls as [{ data: Record<string, unknown> }][];
    expect(reset?.[0].data.submittedAt).toBeNull();
    expect(reset?.[0].data.approvedAt).toBeNull();

    const [cleared] = tx.timesheetApproval.deleteMany.mock.calls as [
      { where: { organizationId: string; timesheetId: { in: string[] } } },
    ][];
    expect(cleared?.[0].where.organizationId).toBe(ORG);
    expect(cleared?.[0].where.timesheetId.in.length).toBeGreaterThan(0);
  });

  it('rebuilds only attendance-derived entries, leaving manual ones alone', async () => {
    const { service, tx } = setup(4, 2);
    await service.derive(context(), PERIOD);

    expect(tx.timesheetEntry.deleteMany.mock.calls[0]?.[0].where.source).toBe('ATTENDANCE');
  });

  it('refuses without the write permission', async () => {
    const { service } = setup(1, 1);
    await expect(service.derive(context(['timesheets.read']), PERIOD)).rejects.toThrow(
      'Missing permission: timesheets.write',
    );
  });
});
