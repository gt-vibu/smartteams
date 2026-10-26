import type { DomainContext } from '../../common/context/domain-context';
import { markLeaveDaysOnAttendance } from './leave-attendance-sync';

it('marks only the charged dates, preserving excluded weekends after calendar settings change', async () => {
  const context: DomainContext = {
    organizationId: 'org',
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    permissions: new Set(),
    requestId: 'r',
    correlationId: 'c',
  };
  const tx = {
    attendanceRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const written = await markLeaveDaysOnAttendance(tx as never, context, {
    id: 'leave',
    employeeId: 'employee',
    branchId: 'branch',
    startDate: new Date('2026-11-13'),
    endDate: new Date('2026-11-16'),
    chargedDates: ['2026-11-13', '2026-11-16'],
  });
  expect(written).toBe(2);
  expect(
    tx.attendanceRecord.create.mock.calls.map((call: [{ data: { workDate: Date } }]) =>
      call[0].data.workDate.toISOString().slice(0, 10),
    ),
  ).toEqual(['2026-11-13', '2026-11-16']);
});
