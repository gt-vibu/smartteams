import { AttendancePunchType } from '../../generated/prisma/enums';
import { attendanceTotals, correctionPunchUpdates, hasOpenPunch } from './attendance.service';
import { toPreferencesDto } from './attendance-shared';

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 9, minutes));

describe('attendance calculations', () => {
  it('calculates regular and overtime minutes from ordered punch pairs', () => {
    const result = attendanceTotals(
      [
        { punchType: AttendancePunchType.IN, occurredAt: at(0) },
        { punchType: AttendancePunchType.OUT, occurredAt: at(30) },
        { punchType: AttendancePunchType.IN, occurredAt: at(45) },
        { punchType: AttendancePunchType.OUT, occurredAt: at(120) },
      ],
      60,
    );

    expect(result).toEqual({ workedMinutes: 105, overtimeMinutes: 45, completed: true });
  });

  it('detects an unmatched final check-in', () => {
    expect(hasOpenPunch([{ punchType: AttendancePunchType.IN, occurredAt: at(0) }])).toBe(true);
    expect(
      hasOpenPunch([
        { punchType: AttendancePunchType.IN, occurredAt: at(0) },
        { punchType: AttendancePunchType.OUT, occurredAt: at(30) },
      ]),
    ).toBe(false);
  });

  it('maps an approved correction to the existing check-in and check-out punches', () => {
    const punches = [
      { id: 'in', punchType: AttendancePunchType.IN, occurredAt: at(0) },
      { id: 'out', punchType: AttendancePunchType.OUT, occurredAt: at(30) },
    ];

    expect(
      correctionPunchUpdates(punches, {
        correctedCheckIn: new Date(Date.UTC(2026, 0, 1, 6, 0)).toISOString(),
        correctedCheckOut: new Date(Date.UTC(2026, 0, 1, 17, 0)).toISOString(),
      }),
    ).toEqual([
      { id: 'in', occurredAt: new Date(Date.UTC(2026, 0, 1, 6, 0)) },
      { id: 'out', occurredAt: new Date(Date.UTC(2026, 0, 1, 17, 0)) },
    ]);
  });
});

describe('attendance session mode preferences', () => {
  it('defaults attendanceSessionMode to SINGLE when metadata is empty or absent', () => {
    const dto = toPreferencesDto({
      id: 'pref-1',
      organizationId: 'org-1',
      geofenceMode: null,
      biometricVerificationMode: null,
      geofenceOwnerSource: 'NATIVE',
      biometricOwnerSource: 'NATIVE',
      metadata: {},
    });

    expect(dto.attendanceSessionMode).toBe('SINGLE');
  });

  it('preserves MULTIPLE attendanceSessionMode when configured in metadata', () => {
    const dto = toPreferencesDto({
      id: 'pref-2',
      organizationId: 'org-1',
      geofenceMode: null,
      biometricVerificationMode: null,
      geofenceOwnerSource: 'NATIVE',
      biometricOwnerSource: 'NATIVE',
      metadata: { attendanceSessionMode: 'MULTIPLE' },
    });

    expect(dto.attendanceSessionMode).toBe('MULTIPLE');
  });
});
