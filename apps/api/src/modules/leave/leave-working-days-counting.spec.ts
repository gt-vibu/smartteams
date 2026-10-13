import { workingDays } from './leave-balance-ops';

describe('Leave workingDays counting', () => {
  it('Mon-Sat employee: Saturday counts as working; Mon-Fri employee: Saturday does not; holiday excluded; half-day if supported', async () => {
    // Range: Friday 2026-10-02 (Holiday), Saturday 2026-10-03, Sunday 2026-10-04, Monday 2026-10-05
    const startDate = new Date('2026-10-02T00:00:00.000Z');
    const endDate = new Date('2026-10-05T00:00:00.000Z');

    const mockHolidayTx = {
      holiday: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'h-1',
            holidayDate: new Date('2026-10-02T00:00:00.000Z'),
            type: 'MANDATORY',
            branchId: null,
          },
        ]),
      },
      employeeHolidaySelection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      employeeShiftAssignment: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    // 1. Mon-Fri Employee (weekDays: [1,2,3,4,5]): Friday is holiday, Sat & Sun off, Mon working -> 1 day
    const countMonFri = await workingDays(
      mockHolidayTx as never,
      'org-1',
      'branch-1',
      startDate,
      endDate,
      [1, 2, 3, 4, 5],
      'emp-mon-fri',
      false,
    );
    expect(countMonFri).toBe(1);

    // 2. Mon-Sat Employee (weekDays: [1,2,3,4,5,6]): Friday is holiday, Sat working, Sun off, Mon working -> 2 days
    const countMonSat = await workingDays(
      mockHolidayTx as never,
      'org-1',
      'branch-1',
      startDate,
      endDate,
      [1, 2, 3, 4, 5, 6],
      'emp-mon-sat',
      false,
    );
    expect(countMonSat).toBe(2);
  });
});
