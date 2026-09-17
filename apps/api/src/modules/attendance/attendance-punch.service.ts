import { Injectable } from '@nestjs/common';
import { AttendanceLocationService } from './attendance-location.service';
import {
  AttendancePunchType,
  AttendanceStatus,
  AttendanceDayStatus,
  GeofenceMode,
  BiometricVerificationMode,
} from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { markPayrollStale } from '../payroll/payroll-staleness';
import { canActForAllEmployees, resolveActingEmployeeId } from '../employees/employee-scope';
import {
  attendanceTotals,
  canReadAllEmployees,
  decodeAttendanceCursor,
  encodeAttendanceCursor,
  hasOpenPunch,
  isUuid,
  toPunchDto,
  toRecordDto,
  workDateInTimeZone,
} from './attendance-shared';

export type PunchInput = {
  employeeId: string;
  occurredAt: string;
  workDate: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  branchId?: string;
  webauthnCredentialId?: string;
  externalId?: string;
  dayStatus?: AttendanceDayStatus;
  source: 'NATIVE' | 'FEDERATION';
  capturedByUserId?: string;
  manualEntry?: boolean;
};
@Injectable()
/**
 * Recording attendance and reading it back.
 *
 * `punch` is the hot path of the product — the one endpoint an entire workforce hits twice a day
 * — so it stays on its own rather than sharing a file with the correction workflow that runs a
 * few times a week.
 */
@Injectable()
export class AttendancePunchService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly locations: AttendanceLocationService,
  ) {}

  /**
   * Records a punch.
   *
   * Two things here are deliberately not taken from the request when an employee punches for
   * themselves: who the punch belongs to, and when it happened.
   *
   * The employee is resolved from the session. `attendance.write` is a self-service permission —
   * every seeded employee holds it — so trusting `employeeId` from the body let anyone with a
   * colleague's id punch on their behalf.
   *
   * The time is the server's. A punch is evidence that someone was present at a moment, and a
   * value the browser chose is not evidence of anything; accepting it let an employee book a
   * historical or future shift, which flows straight into attendance, overtime and pay. Callers
   * with organisation-wide breadth — HR, an administrator, a federation partner importing from a
   * device — still supply their own timestamps, because for them the request *is* the record of
   * something that happened elsewhere. An employee correcting a genuine mistake uses the
   * correction workflow, which is permissioned, audited and keeps the original event.
   */
  async punch(context: DomainContext, type: AttendancePunchType, input: PunchInput) {
    requirePermission(context, 'attendance.write');
    if (
      input.dayStatus &&
      !new Set<AttendanceDayStatus>([
        AttendanceDayStatus.PRESENT,
        AttendanceDayStatus.LATE,
        AttendanceDayStatus.HALF_DAY,
      ]).has(input.dayStatus)
    ) {
      throw new ConflictError('Absence and leave statuses must be recorded by their workflows');
    }
    return this.database.run(context, async (tx) => {
      const actsForOthers = canActForAllEmployees(context, 'attendance.read.all');
      const employeeId = await resolveActingEmployeeId(
        tx,
        context,
        input.employeeId,
        'attendance.read.all',
      );
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        include: {
          branchAssignments: {
            where: { isPrimary: true, endsOn: null },
            orderBy: { startsOn: 'desc' },
            take: 1,
          },
        },
      });
      if (!employee || employee.status !== 'ACTIVE') throw new NotFoundError('Active employee');
      const branchId =
        input.branchId ?? employee.primaryBranchId ?? employee.branchAssignments[0]?.branchId;
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        select: { timezone: true },
      });
      // The work date follows the organisation's own calendar, not the server's: a punch at
      // 00:30 in Asia/Kolkata belongs to that day locally, and UTC would file it under the
      // previous one.
      const now = new Date();
      const occurredAt = actsForOthers ? new Date(input.occurredAt) : now;
      const workDate = actsForOthers
        ? new Date(input.workDate)
        : new Date(workDateInTimeZone(now, organization.timezone));
      const branch = branchId
        ? await tx.branch.findFirst({
            where: { id: branchId, organizationId: context.organizationId },
          })
        : undefined;
      const mode = branch?.geofenceMode ?? settings.geofenceMode;
      const biometricMode = branch?.biometricVerificationMode ?? settings.biometricVerificationMode;
      const geofence = await this.locations.evaluateGeofence(
        tx,
        context.organizationId,
        branchId,
        input.latitude,
        input.longitude,
        mode,
      );
      let webauthnCredentialId: string | undefined;
      if (input.webauthnCredentialId) {
        const credentialSelector = isUuid(input.webauthnCredentialId)
          ? {
              OR: [
                { id: input.webauthnCredentialId },
                { credentialId: input.webauthnCredentialId },
              ],
            }
          : { credentialId: input.webauthnCredentialId };
        const credential = await tx.webauthnCredential.findFirst({
          where: {
            organizationId: context.organizationId,
            employeeId,
            status: 'ACTIVE',
            reviewRequired: false,
            ...credentialSelector,
          },
          select: { id: true },
        });
        if (!credential)
          throw new ConflictError(
            'The supplied WebAuthn credential is not active for this employee',
          );
        webauthnCredentialId = credential.id;
      }
      const biometricVerified = Boolean(webauthnCredentialId);
      const record = await tx.attendanceRecord.upsert({
        where: {
          employeeId_workDate: { employeeId, workDate },
        },
        create: {
          organizationId: context.organizationId,
          employeeId,
          branchId,
          workDate,
          status: AttendanceStatus.OPEN,
          dayStatus: input.dayStatus ?? AttendanceDayStatus.PRESENT,
          sourceAccessMode: context.accessMode,
        },
        update: {
          branchId,
          sourceAccessMode: context.accessMode,
          ...(input.dayStatus ? { dayStatus: input.dayStatus } : {}),
          version: { increment: 1 },
        },
      });
      const meta =
        settings.metadata && typeof settings.metadata === 'object'
          ? (settings.metadata as Record<string, unknown>)
          : {};
      const sessionMode = meta.attendanceSessionMode === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE';

      const existingPunches = await tx.attendancePunch.findMany({
        where: { attendanceRecordId: record.id, organizationId: context.organizationId },
        orderBy: { occurredAt: 'asc' },
        select: { punchType: true, occurredAt: true },
      });
      const hasOpenInterval = hasOpenPunch(existingPunches);
      if (type === AttendancePunchType.IN && hasOpenInterval)
        throw new ConflictError('An open attendance interval already exists');
      if (type === AttendancePunchType.OUT && !hasOpenInterval)
        throw new ConflictError('A check-out requires an open check-in interval');
      if (
        type === AttendancePunchType.IN &&
        sessionMode === 'SINGLE' &&
        existingPunches.length >= 2
      ) {
        throw new ConflictError(
          'An attendance session has already been completed for today (Single Session mode)',
        );
      }
      const punch = await tx.attendancePunch.create({
        data: {
          organizationId: context.organizationId,
          attendanceRecordId: record.id,
          employeeId,
          punchType: type,
          occurredAt,
          source: input.source,
          capturedByUserId: input.capturedByUserId ?? context.actor.userId,
          metadata: input.manualEntry ? { captureMode: 'MANUAL' } : { captureMode: 'SELF_SERVICE' },
          externalId: input.externalId,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMeters: input.accuracyMeters,
          workLocationId: geofence.workLocationId,
          isWithinGeofence: geofence.isWithin,
          distanceFromLocationMeters: geofence.distance,
          biometricVerified,
          webauthnCredentialId,
        },
      });
      const allPunches = await tx.attendancePunch.findMany({
        where: { attendanceRecordId: record.id, organizationId: context.organizationId },
        orderBy: { occurredAt: 'asc' },
        select: { punchType: true, occurredAt: true },
      });
      const totals = attendanceTotals(allPunches, settings.standardDayMinutes);
      const updatedRecord = await tx.attendanceRecord.update({
        where: { id: record.id },
        data: {
          status: totals.completed ? AttendanceStatus.COMPLETED : AttendanceStatus.OPEN,
          workedMinutes: totals.workedMinutes,
          overtimeMinutes: totals.overtimeMinutes,
          version: { increment: 1 },
        },
      });
      // Worked and overtime minutes are payroll inputs, so a run already calculated over this
      // date is no longer derived from the attendance it claims to be.
      await markPayrollStale(tx, context.organizationId, record.workDate, record.workDate);
      const reviewReasons = [
        mode === GeofenceMode.REQUIRED && geofence.isWithin !== true
          ? 'Punch requires geofence review'
          : undefined,
        biometricMode === BiometricVerificationMode.REQUIRED
          ? 'Punch requires biometric verification'
          : undefined,
      ].filter((reason): reason is string => reason !== undefined);
      const correctionReason = reviewReasons.length ? reviewReasons.join('; ') : undefined;
      const correction = correctionReason
        ? await tx.attendanceCorrection.create({
            data: {
              organizationId: context.organizationId,
              attendanceRecordId: updatedRecord.id,
              attendancePunchId: punch.id,
              reason: correctionReason,
              beforeSnapshot: jsonSnapshot(punch),
              afterSnapshot: jsonSnapshot(punch),
              status: 'PENDING',
              requestedByUserId: context.actor.userId,
              requestedByClientId: context.actor.clientId,
            },
          })
        : undefined;
      await this.audit.record(
        context,
        {
          entityType: 'ATTENDANCE_PUNCH',
          entityId: punch.id,
          action:
            type === AttendancePunchType.IN ? 'ATTENDANCE_CHECKED_IN' : 'ATTENDANCE_CHECKED_OUT',
          afterState: jsonSnapshot({ punch, correction }),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'AttendanceRecord',
          aggregateId: updatedRecord.id,
          aggregateVersion: updatedRecord.version,
          eventType: 'attendance.punch.created',
          payload: jsonSnapshot({ record: updatedRecord, punch, correction }),
        },
        tx,
      );
      return {
        record: toRecordDto(updatedRecord),
        punch: toPunchDto(punch),
        reviewRequired: Boolean(correction),
      };
    });
  }

  async list(
    context: DomainContext,
    filters: {
      employeeId?: string;
      branchId?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    requirePermission(context, 'attendance.read');
    return this.database.run(context, async (tx) => {
      let employeeId = filters.employeeId;
      if (!canReadAllEmployees(context, 'attendance.read.all')) {
        const self = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId },
          select: { id: true },
        });
        if (!self) return { records: [], nextCursor: undefined };
        if (employeeId && employeeId !== self.id)
          throw new ConflictError('Employees may only read their own attendance records');
        employeeId = self.id;
      }
      const cursorId = filters.cursor ? decodeAttendanceCursor(filters.cursor) : undefined;
      const limit = Math.min(filters.limit ?? 100, 500);
      const records = await tx.attendanceRecord.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          branchId: context.branchId,
          workDate: {
            gte: filters.from ? new Date(filters.from) : undefined,
            lte: filters.to ? new Date(filters.to) : undefined,
          },
        },
        include: {
          punches: {
            orderBy: { occurredAt: 'asc' },
            include: { capturedBy: { select: { displayName: true } } },
          },
          employee: {
            select: {
              id: true,
              externalId: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        orderBy: { id: 'desc' },
        take: limit + 1,
      });
      const hasNextPage = records.length > limit;
      const page = records.slice(0, limit);
      return {
        records: page.map((record) => ({
          ...toRecordDto(record),
          externalEmployeeId: record.employee.externalId,
          employee: record.employee,
          punches: record.punches.map((punch) => toPunchDto(punch)),
        })),
        nextCursor: hasNextPage ? encodeAttendanceCursor(page.at(-1)?.id) : undefined,
      };
    });
  }
}
