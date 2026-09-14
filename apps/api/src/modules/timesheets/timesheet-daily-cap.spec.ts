import { TimesheetEntriesService } from './timesheet-entries.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { AccessMode } from '../../generated/prisma/enums';

/**
 * A day's logged time cannot pass 24 hours.
 *
 * Minutes are the caller's own figure, and nothing bounded them: a single entry of 100,000 minutes
 * on one day was accepted and added to the sheet payroll pays from once approved.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SHEET = '22222222-2222-4222-8222-222222222222';
const SELF = '55555555-5555-4555-8555-555555555555';

function context(overrides: Partial<DomainContext> = {}): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(['timesheets.write']),
    ...overrides,
  };
}

function setup(alreadyLogged: number | null) {
  const tx = {
    timesheet: {
      findFirst: jest.fn().mockResolvedValue({ id: SHEET, employeeId: SELF, status: 'DRAFT' }),
      update: jest.fn().mockResolvedValue({ id: SHEET }),
    },
    employee: { findFirst: jest.fn().mockResolvedValue({ id: SELF }) },
    timesheetEntry: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { minutes: alreadyLogged } }),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'entry-1', ...args.data }),
      ),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { tx, service: new TimesheetEntriesService(database as never, audit) };
}

const entry = (minutes: number) => ({ workDate: '2026-09-14', minutes, description: 'Work' });

describe('timesheet daily cap', () => {
  it('refuses a single entry longer than a day', async () => {
    const { tx, service } = setup(null);
    await expect(service.addManualEntry(context(), SHEET, entry(100_000))).rejects.toThrow(
      'A day has 24 hours',
    );
    expect(tx.timesheetEntry.create).not.toHaveBeenCalled();
    expect(tx.timesheet.update).not.toHaveBeenCalled();
  });

  it('refuses an entry that takes the day past 24 hours', async () => {
    const { tx, service } = setup(20 * 60);
    await expect(service.addManualEntry(context(), SHEET, entry(5 * 60))).rejects.toThrow(
      'A day has 24 hours',
    );
    expect(tx.timesheetEntry.create).not.toHaveBeenCalled();
  });

  it('accepts a day that reaches exactly 24 hours', async () => {
    const { tx, service } = setup(20 * 60);
    await service.addManualEntry(context(), SHEET, entry(4 * 60));
    expect(tx.timesheetEntry.create).toHaveBeenCalled();
  });

  it('counts only the same sheet and day', async () => {
    const { tx, service } = setup(null);
    await service.addManualEntry(context(), SHEET, entry(90));
    const [args] = tx.timesheetEntry.aggregate.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).toEqual({
      timesheetId: SHEET,
      workDate: new Date('2026-09-14T00:00:00.000Z'),
    });
  });

  it('holds for a federated entry too — no partner can log a 25-hour day', async () => {
    const { tx, service } = setup(null);
    await expect(
      service.addManualEntry(
        context({
          accessMode: 'FEDERATION' as AccessMode,
          actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
        }),
        SHEET,
        entry(1_441),
      ),
    ).rejects.toThrow('A day has 24 hours');
    expect(tx.timesheetEntry.create).not.toHaveBeenCalled();
  });
});
