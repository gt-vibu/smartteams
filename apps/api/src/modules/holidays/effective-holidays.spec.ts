import { getEffectiveHolidayDates } from './effective-holidays';

const ORG = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const EMP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('getEffectiveHolidayDates', () => {
  it('returns mandatory holidays and excludes unselected optional holidays', async () => {
    const tx = {
      holiday: {
        findMany: jest.fn().mockResolvedValue([
          { holidayDate: new Date('2026-01-26T00:00:00.000Z'), isOptional: false },
          { holidayDate: new Date('2026-08-15T00:00:00.000Z'), isOptional: false },
        ]),
      },
      employeeHolidaySelection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const dates = await getEffectiveHolidayDates(tx as never, {
      organizationId: ORG,
      branchId: BRANCH,
      employeeId: EMP_A,
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-12-31T00:00:00.000Z'),
    });

    expect(dates.has('2026-01-26')).toBe(true);
    expect(dates.has('2026-08-15')).toBe(true);
    expect(dates.has('2026-01-15')).toBe(false); // Unselected optional holiday not included
  });

  it('includes employee-selected optional holidays only for that specific employee', async () => {
    const tx = {
      holiday: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { holidayDate: new Date('2026-01-26T00:00:00.000Z'), isOptional: false },
          ]),
      },
      employeeHolidaySelection: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { employeeId: string } }) => {
          if (where.employeeId === EMP_A) {
            return Promise.resolve([
              {
                holiday: { holidayDate: new Date('2026-01-15T00:00:00.000Z'), isOptional: true },
              },
            ]);
          }
          return Promise.resolve([]);
        }),
      },
    };

    // Employee A selected Jan 15 Pongal
    const datesA = await getEffectiveHolidayDates(tx as never, {
      organizationId: ORG,
      branchId: BRANCH,
      employeeId: EMP_A,
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-12-31T00:00:00.000Z'),
    });

    expect(datesA.has('2026-01-26')).toBe(true);
    expect(datesA.has('2026-01-15')).toBe(true);

    // Employee B did NOT select Pongal
    const datesB = await getEffectiveHolidayDates(tx as never, {
      organizationId: ORG,
      branchId: BRANCH,
      employeeId: EMP_B,
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-12-31T00:00:00.000Z'),
    });

    expect(datesB.has('2026-01-26')).toBe(true);
    expect(datesB.has('2026-01-15')).toBe(false);
  });
});
