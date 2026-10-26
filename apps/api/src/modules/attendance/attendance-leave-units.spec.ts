import type { Prisma } from '../../generated/prisma/client';
import { attendanceLeaveUnits } from './attendance-leave-units';

const date = new Date('2026-10-08');
const half = {
  employeeId: 'a',
  startDate: date,
  endDate: date,
  chargedDates: ['2026-10-08'],
  session: 'FIRST_HALF',
};
describe('attendance approved leave units', () => {
  it('counts half a day without returning private leave details', async () => {
    const findMany = jest
      .fn<Promise<Array<typeof half>>, [Prisma.LeaveRequestFindManyArgs]>()
      .mockResolvedValue([half]);
    const tx = { leaveRequest: { findMany } } as unknown as Prisma.TransactionClient;
    const units = await attendanceLeaveUnits(tx, 'org', [
      { employeeId: 'a', workDate: date },
      { employeeId: 'b', workDate: date },
    ]);
    expect(units.get('a:2026-10-08')).toBe(0.5);
    expect(units.get('b:2026-10-08')).toBe(0);
    expect(findMany.mock.calls[0]![0]).toMatchObject({
      where: { organizationId: 'org', status: 'APPROVED' },
    });
    expect(findMany.mock.calls[0]![0].select).not.toHaveProperty('reason');
  });
  it('adds complementary half-days and caps the result at one day', async () => {
    const tx = {
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([half, { ...half, session: 'SECOND_HALF' }]),
      },
    } as unknown as Prisma.TransactionClient;
    expect(
      (await attendanceLeaveUnits(tx, 'org', [{ employeeId: 'a', workDate: date }])).get(
        'a:2026-10-08',
      ),
    ).toBe(1);
  });
  it('does not query leave for an empty attendance page', async () => {
    expect((await attendanceLeaveUnits({} as Prisma.TransactionClient, 'org', [])).size).toBe(0);
  });
});
