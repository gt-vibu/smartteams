import { calendarDate, membershipState, overlaps, todayIn } from './employee-branch-rules';
import { EmployeeBranchTransferProcessor } from './employee-branch-transfer.processor';

const day = (value: string) => calendarDate(value);

type UpdateManyInput = {
  where?: Record<string, unknown>;
  data?: { primaryBranchId?: string; version?: { increment: number } };
};

type UpdateMany = (input: UpdateManyInput) => Promise<{ count: number }>;

describe('branch membership dates', () => {
  it('reads today in the organization’s own timezone', () => {
    // 20:00 UTC on the 30th is already the 1st in Kolkata.
    const now = new Date('2026-09-30T20:00:00.000Z');
    expect(todayIn('Asia/Kolkata', now).toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(todayIn('UTC', now).toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('knows a membership that has not begun, is running, or is over', () => {
    const today = day('2026-09-21');
    expect(membershipState({ startsOn: day('2026-10-01'), endsOn: null }, today)).toBe('UPCOMING');
    expect(membershipState({ startsOn: day('2026-01-01'), endsOn: null }, today)).toBe('ACTIVE');
    // The last day still counts as belonging.
    expect(membershipState({ startsOn: day('2026-01-01'), endsOn: today }, today)).toBe('ACTIVE');
    expect(membershipState({ startsOn: day('2026-01-01'), endsOn: day('2026-09-20') }, today)).toBe(
      'ENDED',
    );
  });

  it('treats ranges that share a single day as overlapping', () => {
    const a = { startsOn: day('2026-01-01'), endsOn: day('2026-09-30') };
    expect(overlaps(a, { startsOn: day('2026-09-30'), endsOn: null })).toBe(true);
    expect(overlaps(a, { startsOn: day('2026-10-01'), endsOn: null })).toBe(false);
  });
});

describe('the scheduled transfer sweep', () => {
  function setup(primaryBranchId: string) {
    const updateMany = jest.fn() as jest.MockedFunction<UpdateMany>;
    updateMany.mockResolvedValue({ count: 1 });
    const tx = {
      employeeBranchAssignment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { employeeId: 'e1', branchId: 'new', employee: { primaryBranchId } },
          ]),
        findFirst: jest.fn().mockResolvedValue({ branchId: 'new' }),
      },
      employee: { updateMany },
    };
    const database = {
      runSystem: jest.fn().mockResolvedValue([{ id: 'org-1', timezone: 'Asia/Kolkata' }]),
      run: jest.fn((_context: unknown, callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const processor = new EmployeeBranchTransferProcessor(database as never, {} as never);
    return { tx, processor };
  }

  it('moves the primary branch on the day a scheduled transfer begins', async () => {
    const { tx, processor } = setup('old');
    expect(await processor.syncAll(new Date('2026-10-01T06:00:00.000Z'))).toBe(1);
    expect(tx.employee.updateMany.mock.calls[0]?.[0]?.data?.primaryBranchId).toBe('new');
  });

  it('leaves an employee who is already on the right branch alone', async () => {
    const { tx, processor } = setup('new');
    expect(await processor.syncAll(new Date('2026-10-01T06:00:00.000Z'))).toBe(0);
    expect(tx.employee.updateMany).not.toHaveBeenCalled();
  });
});
