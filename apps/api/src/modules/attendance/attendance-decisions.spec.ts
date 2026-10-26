import type { DomainContext } from '../../common/context/domain-context';
import { AttendancePunchSource, AttendancePunchType } from '../../generated/prisma/enums';
import { AttendanceDecisionsService } from './attendance-decisions.service';

describe('AttendanceDecisionsService', () => {
  it('creates auditable punches when an absent-day regularization is approved', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = new AttendanceDecisionsService({} as never, {} as never);
    const helper = service as unknown as {
      addMissingAttendanceDay: (
        tx: unknown,
        context: DomainContext,
        correction: unknown,
        approverUserId: string,
      ) => Promise<Array<{ punchType: AttendancePunchType; occurredAt: Date }> | undefined>;
    };
    const context = {
      organizationId: 'org-1',
      actor: { type: 'USER', userId: 'admin-1' },
    } as DomainContext;
    const checkIn = '2026-10-12T03:40:00.000Z';
    const checkOut = '2026-10-12T16:50:00.000Z';
    const correction = {
      id: 'correction-1',
      attendanceRecordId: 'attendance-1',
      requestedByClientId: null,
      attendanceRecord: { employeeId: 'employee-1', punches: [] },
      afterSnapshot: {
        missingAttendanceDay: true,
        correctedCheckIn: checkIn,
        correctedCheckOut: checkOut,
      },
    };

    const punches = await helper.addMissingAttendanceDay(
      { attendancePunch: { createMany } },
      context,
      correction,
      'admin-1',
    );

    expect(punches).toEqual([
      { punchType: AttendancePunchType.IN, occurredAt: new Date(checkIn) },
      { punchType: AttendancePunchType.OUT, occurredAt: new Date(checkOut) },
    ]);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: 'org-1',
          attendanceRecordId: 'attendance-1',
          employeeId: 'employee-1',
          punchType: AttendancePunchType.IN,
          source: AttendancePunchSource.ADMIN_CORRECTION,
          capturedByUserId: 'admin-1',
          metadata: { captureMode: 'CORRECTION', attendanceCorrectionId: 'correction-1' },
        }),
        expect.objectContaining({
          organizationId: 'org-1',
          attendanceRecordId: 'attendance-1',
          employeeId: 'employee-1',
          punchType: AttendancePunchType.OUT,
          source: AttendancePunchSource.ADMIN_CORRECTION,
          capturedByUserId: 'admin-1',
          metadata: { captureMode: 'CORRECTION', attendanceCorrectionId: 'correction-1' },
        }),
      ],
    });
  });

  it('also handles older absent-day approvals without the newer marker', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new AttendanceDecisionsService({} as never, {} as never);
    const helper = service as unknown as {
      addMissingAttendanceDay: (
        tx: unknown,
        context: DomainContext,
        correction: unknown,
        approverUserId: string,
      ) => Promise<Array<{ punchType: AttendancePunchType; occurredAt: Date }> | undefined>;
    };
    const context = {
      organizationId: 'org-1',
      actor: { type: 'USER', userId: 'admin-1' },
    } as DomainContext;
    const checkIn = '2026-10-12T03:40:00.000Z';
    const punches = await helper.addMissingAttendanceDay(
      { attendancePunch: { createMany } },
      context,
      {
        id: 'older-correction',
        attendanceRecordId: 'attendance-1',
        requestedByClientId: null,
        attendanceRecord: { employeeId: 'employee-1', punches: [] },
        afterSnapshot: { correctedCheckIn: checkIn },
      },
      'admin-1',
    );

    expect(punches).toEqual([{ punchType: AttendancePunchType.IN, occurredAt: new Date(checkIn) }]);
    expect(createMany).toHaveBeenCalledTimes(1);
  });
});
