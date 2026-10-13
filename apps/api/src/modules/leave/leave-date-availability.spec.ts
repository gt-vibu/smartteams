import type { DomainContext } from '../../common/context/domain-context';
import { LeavePreviewService } from './leave-preview.service';
import { LeaveRequestsService } from './leave-requests.service';

const context: DomainContext = {
  organizationId: 'org',
  accessMode: 'NATIVE',
  actor: { type: 'USER', userId: 'user' },
  correlationId: 'c',
  requestId: 'r',
  permissions: new Set(['*']),
};
function setup() {
  const tx = {
    employee: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'self',
        primaryBranchId: 'branch',
        status: 'ACTIVE',
        userId: 'user',
      }),
    },
    organizationSettings: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ workWeekDays: [1, 2, 3, 4, 5], leaveYearStartMonth: 4 }),
    },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
    leaveType: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'type',
        isActive: true,
        sandwichOffDays: false,
        requiresAttachment: false,
      }),
    },
    leavePolicyAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    holiday: { findMany: jest.fn().mockResolvedValue([{ holidayDate: new Date('2026-10-07') }]) },
    employeeHolidaySelection: { findMany: jest.fn().mockResolvedValue([]) },
    employeeShiftAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const database = {
    run: jest.fn((_context: DomainContext, work: (client: typeof tx) => unknown) => work(tx)),
  };
  return {
    tx,
    preview: new LeavePreviewService(database as never),
    requests: new LeaveRequestsService(database as never, {} as never, {} as never),
  };
}
describe('Leave date selection and submission', () => {
  it('uses the authenticated employee, configured workweek, holidays and all active request dates', async () => {
    const { tx, preview } = setup();
    tx.leaveRequest.findMany.mockResolvedValue([
      { startDate: new Date('2026-10-08'), endDate: new Date('2026-10-09') },
    ] as never);
    const result = await preview.availability(context, '2026-10-05', '2026-10-11');
    expect(result.leaveYearStartMonth).toBe(4);
    expect(result.dates.map((day) => day.reason)).toEqual([
      null,
      null,
      'Holiday',
      'Already requested for leave',
      'Already requested for leave',
      'Weekly off',
      'Weekly off',
    ]);
    expect(tx.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org', userId: 'user' } }),
    );
    const queries = tx.leaveRequest.findMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(queries[0]?.[0].where).toMatchObject({
      employeeId: 'self',
      organizationId: 'org',
      status: { in: ['PENDING', 'APPROVED'] },
    });
  });
  it('honours an assigned shift including a working Saturday and a weekday off', async () => {
    const { tx, preview } = setup();
    tx.employeeShiftAssignment.findMany.mockResolvedValue([
      {
        startsOn: new Date('2026-10-01'),
        endsOn: null,
        shift: { daysOfWeek: [2, 3, 4, 5, 6] },
      },
    ] as never);
    const result = await preview.availability(context, '2026-10-05', '2026-10-11');
    expect(result.dates[0]?.reason).toBe('Weekly off');
    expect(result.dates[5]?.reason).toBeNull();
  });
  it.each(['FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'] as const)(
    'refuses a second request on a booked date for %s, under a transaction lock',
    async (session) => {
      const { tx, requests } = setup();
      tx.leaveRequest.findMany.mockResolvedValue([
        {
          startDate: new Date('2026-10-06'),
          endDate: new Date('2026-10-06'),
          status: 'PENDING',
          session: 'FULL_DAY',
        },
      ] as never);
      await expect(
        requests.createRequest(context, {
          employeeId: 'self',
          leaveTypeId: 'type',
          startDate: '2026-10-06',
          endDate: '2026-10-06',
          source: 'NATIVE',
          session,
        }),
      ).rejects.toThrow('already pending');
      expect(tx.$queryRaw).toHaveBeenCalled();
      const queries = tx.leaveRequest.findMany.mock.calls as unknown as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(queries[0]?.[0].where).not.toHaveProperty('session');
    },
  );
  it.each([
    ['2026-10-10', '2026-10-12'],
    ['2026-10-06', '2026-10-07'],
  ])('refuses an off-day endpoint on submission (%s to %s)', async (startDate, endDate) => {
    const { requests } = setup();
    await expect(
      requests.createRequest(context, {
        employeeId: 'self',
        leaveTypeId: 'type',
        startDate,
        endDate,
        source: 'NATIVE',
      }),
    ).rejects.toThrow('start and end on working days');
  });
  it('bounds the calendar request and refuses reversed dates', () => {
    const { preview } = setup();
    expect(() => preview.availability(context, '2026-10-11', '2026-10-05')).toThrow(
      'valid calendar range',
    );
    expect(() => preview.availability(context, '2020-01-01', '2030-01-01')).toThrow(
      'valid calendar range',
    );
  });
});
