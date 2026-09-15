/**
 * How long an attendance correction reason must be.
 *
 * Shared because it was not: the drawer enabled its submit button at five characters while
 * `AttendanceCorrectionDto` required ten, so a reason of six to nine characters passed the form,
 * failed the API, and the drawer reported success anyway. One number, imported by both sides.
 */
export const ATTENDANCE_CORRECTION_REASON_MIN_LENGTH = 10;
export const ATTENDANCE_CORRECTION_REASON_MAX_LENGTH = 500;

import { z } from 'zod';

/**
 * Attendance shapes, matching what `AttendanceService` returns.
 *
 * Parsed rather than trusted: a shape mismatch raises an error instead of letting `undefined`
 * render as a blank cell that reads like "the employee did not work".
 */

export const attendancePunchSchema = z.object({
  id: z.string().uuid(),
  punchType: z.string(),
  occurredAt: z.string(),
  source: z.string().optional(),
  captureMode: z.string().optional(),
  capturedBy: z.object({ displayName: z.string() }).nullable().optional(),
  isWithinGeofence: z.boolean().nullable().optional(),
  // Prisma serialises Decimal as a string; coerce so callers always get a number.
  distanceFromLocationMeters: z.coerce.number().nullable().optional(),
  biometricVerified: z.boolean().optional(),
  webauthnCredentialId: z.string().nullable().optional(),
});

export const attendanceEmployeeSchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  externalId: z.string().nullable().optional(),
});

export const attendanceRecordSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  employeeId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  workDate: z.string(),
  status: z.string(),
  dayStatus: z.string(),
  workedMinutes: z.number(),
  overtimeMinutes: z.number(),
  version: z.number(),
  employee: attendanceEmployeeSchema.optional(),
  punches: z.array(attendancePunchSchema).optional(),
});

export const attendancePageSchema = z.object({
  records: z.array(attendanceRecordSchema),
  nextCursor: z.string().optional(),
});

/**
 * A correction, as both `listCorrectionRequests` and `listPendingCorrectionApprovals` return it:
 * the work date, employee and effective attendance are flattened onto the correction rather than
 * nested under a record.
 */
export const attendanceCorrectionSchema = z.object({
  id: z.string().uuid(),
  attendanceId: z.string().uuid(),
  status: z.string(),
  reason: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  workDate: z.string().optional(),
  /** What the correction asks for; a missing check-out carries `missingCheckOut.occurredAt`. */
  afterSnapshot: z.unknown().optional(),
  branchId: z.string().uuid().nullable().optional(),
  employee: attendanceEmployeeSchema.optional(),
  approvals: z
    .array(
      z.object({
        status: z.string(),
        stepNumber: z.number(),
        comment: z.string().nullable().optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional(),
  effectiveAttendance: z
    .object({
      status: z.string(),
      dayStatus: z.string(),
      workedMinutes: z.number(),
      overtimeMinutes: z.number(),
      punches: z.array(attendancePunchSchema).optional(),
    })
    .optional(),
});

export const attendanceCorrectionPageSchema = z.object({
  corrections: z.array(attendanceCorrectionSchema),
});

export const attendancePreferencesSchema = z.object({
  id: z.string().optional(),
  organizationId: z.string().optional(),
  geofenceMode: z.string().nullable(),
  biometricVerificationMode: z.string().nullable(),
  attendanceSessionMode: z.enum(['SINGLE', 'MULTIPLE']).optional().default('SINGLE'),
  geofenceOwnerSource: z.string(),
  biometricOwnerSource: z.string(),
});

export type AttendancePunch = z.infer<typeof attendancePunchSchema>;
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;
export type AttendancePage = z.infer<typeof attendancePageSchema>;
export type AttendanceCorrection = z.infer<typeof attendanceCorrectionSchema>;
export type AttendancePreferences = z.infer<typeof attendancePreferencesSchema>;

function parse<T>(schema: z.ZodType<T>, payload: unknown): T | null {
  const result = schema.safeParse(payload);
  return result.success ? result.data : null;
}

export const parseAttendancePage = (payload: unknown) => parse(attendancePageSchema, payload);
export const parseAttendanceCorrectionPage = (payload: unknown) =>
  parse(attendanceCorrectionPageSchema, payload);
export const parseAttendancePreferences = (payload: unknown) =>
  parse(attendancePreferencesSchema, payload);

/** `YYYY-MM-DD` for a record's work date, whatever precision the API sent. */
export function workDateKey(record: Pick<AttendanceRecord, 'workDate'>): string {
  return record.workDate.slice(0, 10);
}

export function firstPunch(
  record: Pick<AttendanceRecord, 'punches'>,
  type: 'IN' | 'OUT',
): AttendancePunch | null {
  const matching = (record.punches ?? []).filter((punch) => punch.punchType === type);
  if (matching.length === 0) return null;
  // Punches arrive oldest-first; the last OUT is the one that closes the day.
  return (type === 'IN' ? matching[0] : matching[matching.length - 1]) ?? null;
}

/**
 * Whether the employee is currently checked in.
 *
 * Derived from the punch sequence rather than a stored flag: a flag can drift from the punches
 * it is supposed to summarise, and the punches are what payroll reads.
 */
export function isCheckedIn(record: Pick<AttendanceRecord, 'punches'> | null): boolean {
  const punches = record?.punches ?? [];
  const last = punches[punches.length - 1];
  return last?.punchType === 'IN';
}

/** The open check-in's timestamp, for the live timer. Null when not checked in. */
export function openCheckInAt(record: Pick<AttendanceRecord, 'punches'> | null): string | null {
  const punches = record?.punches ?? [];
  const last = punches[punches.length - 1];
  return last?.punchType === 'IN' ? last.occurredAt : null;
}

/** `7h 45m`, or `--` when nothing has been worked and nothing is running. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '--';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
