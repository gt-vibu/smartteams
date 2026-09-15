import type { GeofenceMode, BiometricVerificationMode } from '../../generated/prisma/enums';
import { AttendancePunchType, AttendanceDayStatus } from '../../generated/prisma/enums';
import { type DomainContext } from '../../common/context/domain-context';
import { ConflictError, ForbiddenDomainError } from '../../common/errors/domain-error';

/**
 * Attendance rules and shapes that more than one service needs.
 *
 * Punching in, correcting a record and setting a branch's capture policy all speak the same
 * vocabulary — what a punch looks like on the way out, whether a caller may see everyone's
 * records, how a cursor is encoded. Those were private methods and file-locals on one 1006-line
 * class; as free functions the three services below share them without depending on each other.
 */

export function canReadAllEmployees(context: DomainContext, readAllPermission: string) {
  return (
    context.accessMode === 'FEDERATION' ||
    context.permissions.has('*') ||
    context.permissions.has(readAllPermission)
  );
}

export function assertSettingOwnership(
  context: DomainContext,
  requested: boolean,
  ownerSource: string,
  ownerClientId: string | null,
  setting: string,
) {
  if (!requested) return;
  if (context.accessMode === 'PLATFORM') return;
  const clientId = context.actor.clientId;
  if (clientId) {
    if (ownerSource !== 'FEDERATED' || ownerClientId !== clientId)
      throw new ForbiddenDomainError(
        `Federation ownership has not been granted for ${setting} attendance settings`,
      );
    return;
  }
  if (ownerSource === 'FEDERATED')
    throw new ForbiddenDomainError(
      `Native writes cannot modify federated-owned ${setting} attendance settings`,
    );
}

export function toRecordDto(record: {
  id: string;
  organizationId: string;
  employeeId: string;
  branchId: string | null;
  workDate: Date;
  status: string;
  dayStatus: string;
  workedMinutes: number;
  overtimeMinutes: number;
  version: number;
}) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    employeeId: record.employeeId,
    branchId: record.branchId,
    workDate: record.workDate,
    status: record.status,
    dayStatus: record.dayStatus,
    workedMinutes: record.workedMinutes,
    overtimeMinutes: record.overtimeMinutes,
    version: record.version,
  };
}

export function toPunchDto(punch: {
  id: string;
  punchType: string;
  occurredAt: Date;
  source?: string;
  metadata?: unknown;
  capturedBy?: { displayName: string } | null;
  isWithinGeofence: boolean | null;
  distanceFromLocationMeters: unknown;
  biometricVerified: boolean;
  webauthnCredentialId: string | null;
}) {
  return {
    id: punch.id,
    punchType: punch.punchType,
    occurredAt: punch.occurredAt,
    source: punch.source,
    captureMode: attendanceCaptureMode(punch.metadata),
    ...(punch.capturedBy ? { capturedBy: punch.capturedBy } : {}),
    isWithinGeofence: punch.isWithinGeofence,
    distanceFromLocationMeters: punch.distanceFromLocationMeters,
    biometricVerified: punch.biometricVerified,
    webauthnCredentialId: punch.webauthnCredentialId,
  };
}

export function attendanceCaptureMode(value: unknown) {
  if (typeof value !== 'object' || value === null || !('captureMode' in value)) {
    return undefined;
  }
  const captureMode = value.captureMode;
  return typeof captureMode === 'string' ? captureMode : undefined;
}

export function toPreferencesDto(value: {
  id?: string;
  organizationId?: string;
  geofenceMode: GeofenceMode | null;
  biometricVerificationMode: BiometricVerificationMode | null;
  geofenceOwnerSource: string;
  biometricOwnerSource: string;
  metadata?: unknown;
}) {
  const meta =
    value.metadata && typeof value.metadata === 'object'
      ? (value.metadata as Record<string, unknown>)
      : {};
  const mode = meta.attendanceSessionMode === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE';

  return {
    id: value.id,
    organizationId: value.organizationId,
    geofenceMode: value.geofenceMode,
    biometricVerificationMode: value.biometricVerificationMode,
    attendanceSessionMode: mode,
    geofenceOwnerSource: value.geofenceOwnerSource,
    biometricOwnerSource: value.biometricOwnerSource,
  };
}

export function encodeAttendanceCursor(id: string | undefined) {
  return id ? Buffer.from(JSON.stringify({ id })).toString('base64url') : undefined;
}

export function decodeAttendanceCursor(cursor: string) {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !value.id
    )
      throw new Error();
    return value.id;
  } catch {
    throw new ConflictError('Invalid attendance cursor');
  }
}

export function hasOpenPunch(punches: Array<{ punchType: AttendancePunchType; occurredAt: Date }>) {
  return punches.at(-1)?.punchType === AttendancePunchType.IN;
}

export function attendanceTotals(
  punches: Array<{ punchType: AttendancePunchType; occurredAt: Date }>,
  standardDayMinutes: number,
) {
  let openAt: Date | undefined;
  let workedMinutes = 0;
  for (const punch of punches) {
    if (punch.punchType === AttendancePunchType.IN && !openAt) openAt = punch.occurredAt;
    if (punch.punchType === AttendancePunchType.OUT && openAt) {
      workedMinutes += Math.max(
        0,
        Math.floor((punch.occurredAt.getTime() - openAt.getTime()) / 60_000),
      );
      openAt = undefined;
    }
  }
  return {
    workedMinutes,
    overtimeMinutes: Math.max(0, workedMinutes - standardDayMinutes),
    completed: workedMinutes > 0 && !openAt,
  };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function dayStatusFromSnapshot(value: unknown): AttendanceDayStatus | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const status = (value as Record<string, unknown>).dayStatus;
  return typeof status === 'string' &&
    Object.values(AttendanceDayStatus).includes(status as AttendanceDayStatus)
    ? (status as AttendanceDayStatus)
    : undefined;
}

export function correctionPunchUpdates(
  punches: Array<{ id: string; punchType: AttendancePunchType; occurredAt: Date }>,
  snapshot: unknown,
) {
  const values = snapshotRecord(snapshot);
  const correctedCheckIn = snapshotDate(values?.correctedCheckIn, 'check-in');
  const correctedCheckOut = snapshotDate(values?.correctedCheckOut, 'check-out');
  const sortedPunches = [...punches].sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
  );
  const checkIn = sortedPunches.find((punch) => punch.punchType === AttendancePunchType.IN);
  const checkOut = sortedPunches.find((punch) => punch.punchType === AttendancePunchType.OUT);
  if (correctedCheckIn && !checkIn) throw new ConflictError('Attendance check-in punch is missing');
  if (correctedCheckOut && !checkOut)
    throw new ConflictError('Attendance check-out punch is missing');
  const effectiveCheckIn = correctedCheckIn ?? checkIn?.occurredAt;
  const effectiveCheckOut = correctedCheckOut ?? checkOut?.occurredAt;
  if (effectiveCheckIn && effectiveCheckOut && effectiveCheckOut < effectiveCheckIn)
    throw new ConflictError('Attendance check-out must be after check-in');
  return [
    correctedCheckIn && checkIn ? { id: checkIn.id, occurredAt: correctedCheckIn } : null,
    correctedCheckOut && checkOut ? { id: checkOut.id, occurredAt: correctedCheckOut } : null,
  ].filter((update): update is { id: string; occurredAt: Date } => update !== null);
}

export function snapshotRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function snapshotDate(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new ConflictError(`Attendance corrected ${label} must be a valid date`);
  return new Date(value);
}

/**
 * The calendar date a moment falls on, in a given IANA timezone, as `YYYY-MM-DD`.
 *
 * A punch is filed against the organisation's own day, not the server's. At 00:30 in
 * Asia/Kolkata the UTC date is still yesterday, so deriving the work date from UTC would file the
 * first punches of the morning under the previous day — and with them the whole day's hours.
 *
 * `en-CA` is used because it formats as `YYYY-MM-DD`, which is the shape the column wants; the
 * locale is an implementation detail of that formatting and carries no user-facing meaning. An
 * unknown timezone would make `Intl` throw, so it falls back to UTC rather than failing a punch.
 */
export function workDateInTimeZone(moment: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(moment);
  } catch {
    return moment.toISOString().slice(0, 10);
  }
}
