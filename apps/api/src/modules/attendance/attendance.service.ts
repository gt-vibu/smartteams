import { Injectable } from '@nestjs/common';
import {
  AttendancePunchType,
  AttendanceStatus,
  AttendanceDayStatus,
  GeofenceMode,
  BiometricVerificationMode,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { assertApprover } from '../approvals/approval-authorization';
import { AttendanceLocationService, type WorkLocationInput } from './attendance-location.service';

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
};
@Injectable()
export class AttendanceService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly locations: AttendanceLocationService,
  ) {}

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
      const employee = await tx.employee.findFirst({
        where: { id: input.employeeId, organizationId: context.organizationId },
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
            employeeId: input.employeeId,
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
          employeeId_workDate: { employeeId: input.employeeId, workDate: new Date(input.workDate) },
        },
        create: {
          organizationId: context.organizationId,
          employeeId: input.employeeId,
          branchId,
          workDate: new Date(input.workDate),
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
      const punch = await tx.attendancePunch.create({
        data: {
          organizationId: context.organizationId,
          attendanceRecordId: record.id,
          employeeId: input.employeeId,
          punchType: type,
          occurredAt: new Date(input.occurredAt),
          source: input.source,
          capturedByUserId: context.actor.userId,
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
        record: this.toRecordDto(updatedRecord),
        punch: this.toPunchDto(punch),
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
      const cursorId = filters.cursor ? decodeAttendanceCursor(filters.cursor) : undefined;
      const limit = Math.min(filters.limit ?? 100, 500);
      const records = await tx.attendanceRecord.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId: filters.employeeId,
          branchId: context.branchId,
          workDate: {
            gte: filters.from ? new Date(filters.from) : undefined,
            lte: filters.to ? new Date(filters.to) : undefined,
          },
        },
        include: {
          punches: { orderBy: { occurredAt: 'asc' } },
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
          ...this.toRecordDto(record),
          externalEmployeeId: record.employee.externalId,
          employee: record.employee,
          punches: record.punches.map((punch) => this.toPunchDto(punch)),
        })),
        nextCursor: hasNextPage ? encodeAttendanceCursor(page.at(-1)?.id) : undefined,
      };
    });
  }

  async requestCorrection(
    context: DomainContext,
    attendanceId: string,
    input: { reason: string; afterSnapshot?: Record<string, unknown> },
  ) {
    requirePermission(context, 'attendance.corrections.write');
    requireReason(context, 'Attendance correction requires a reason');
    return this.database.run(context, async (tx) => {
      const record = await tx.attendanceRecord.findFirst({
        where: {
          id: attendanceId,
          organizationId: context.organizationId,
          ...(context.branchId ? { branchId: context.branchId } : {}),
        },
        include: { punches: true },
      });
      if (!record) throw new NotFoundError('Attendance record');
      const policy = await tx.approvalPolicy.findFirst({
        where: {
          organizationId: context.organizationId,
          domain: 'ATTENDANCE_CORRECTION',
          isActive: true,
          isDefault: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      const correction = await tx.attendanceCorrection.create({
        data: {
          organizationId: context.organizationId,
          attendanceRecordId: record.id,
          approvalPolicyId: policy?.id,
          reason: input.reason,
          beforeSnapshot: jsonSnapshot(record),
          afterSnapshot: jsonSnapshot(input.afterSnapshot ?? record),
          status: 'PENDING',
          requestedByUserId: context.actor.userId,
          requestedByClientId: context.actor.clientId,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ATTENDANCE_CORRECTION',
          entityId: correction.id,
          action: 'ATTENDANCE_CORRECTION_REQUESTED',
          afterState: jsonSnapshot(correction),
          reason: input.reason,
        },
        tx,
      );
      return correction;
    });
  }

  async decideCorrection(
    context: DomainContext,
    correctionId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string,
  ) {
    requirePermission(context, 'attendance.corrections.decide');
    requireReason(
      { ...context, reason: comment },
      'Attendance correction decisions require a comment',
    );
    return this.database.run(context, async (tx) => {
      const correction = await tx.attendanceCorrection.findFirst({
        where: {
          id: correctionId,
          organizationId: context.organizationId,
          ...(context.branchId ? { attendanceRecord: { branchId: context.branchId } } : {}),
        },
        include: {
          approvals: true,
          approvalPolicy: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
          attendanceRecord: {
            include: { employee: { include: { manager: { select: { userId: true } } } } },
          },
        },
      });
      if (!correction) throw new NotFoundError('Attendance correction');
      if (correction.status !== 'PENDING')
        throw new ConflictError('Attendance correction is already decided');
      const approverUserId = context.actor.userId;
      if (!approverUserId) throw new ConflictError('A human approver is required');
      const pendingStep = correction.approvalPolicy?.steps.find(
        (step) =>
          !correction.approvals.some((approval) => approval.approvalPolicyStepId === step.id),
      );
      if (pendingStep)
        await assertApprover(
          tx,
          context.organizationId,
          approverUserId,
          correction.attendanceRecord.employee.manager?.userId,
          pendingStep.approverType,
          pendingStep.roleId,
          pendingStep.approverUserId,
          context.branchId,
        );
      const stepNumber = pendingStep?.stepNumber ?? 1;
      const hasMoreSteps = Boolean(
        correction.approvalPolicy?.steps.some((step) => step.stepNumber > stepNumber),
      );
      const finalStatus = status === 'REJECTED' || !hasMoreSteps ? status : 'PENDING';
      const updated = await tx.attendanceCorrection.update({
        where: { id: correction.id },
        data: {
          status: finalStatus,
          approvals: {
            create: {
              organizationId: context.organizationId,
              approverUserId,
              approvalPolicyStepId: pendingStep?.id,
              status,
              comment,
              stepNumber,
            },
          },
        },
      });
      const correctedDayStatus = dayStatusFromSnapshot(correction.afterSnapshot);
      if (status === 'APPROVED' && !hasMoreSteps)
        await tx.attendanceRecord.update({
          where: { id: correction.attendanceRecordId },
          data: {
            status: AttendanceStatus.CORRECTED,
            correctionNote: correction.reason,
            ...(correctedDayStatus ? { dayStatus: correctedDayStatus } : {}),
            version: { increment: 1 },
          },
        });
      await this.audit.record(
        context,
        {
          entityType: 'ATTENDANCE_CORRECTION',
          entityId: correction.id,
          action: `ATTENDANCE_CORRECTION_${status}`,
          beforeState: jsonSnapshot(correction),
          afterState: jsonSnapshot(updated),
          reason: comment,
        },
        tx,
      );
      return updated;
    });
  }

  async updatePreferences(
    context: DomainContext,
    input: {
      branchId?: string;
      geofenceMode?: GeofenceMode;
      biometricVerificationMode?: BiometricVerificationMode;
      workLocations?: WorkLocationInput[];
    },
  ) {
    requirePermission(context, 'attendance.preferences.write');
    if (
      input.geofenceMode === undefined &&
      input.biometricVerificationMode === undefined &&
      input.workLocations === undefined
    )
      throw new ConflictError('At least one attendance preference must be supplied');
    return this.database.run(context, async (tx) => {
      if (input.branchId) {
        const branch = await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        });
        if (!branch) throw new NotFoundError('Branch');
        this.assertSettingOwnership(
          context,
          input.geofenceMode !== undefined || input.workLocations !== undefined,
          branch.geofenceOwnerSource,
          branch.geofenceOwnerClientId,
          'geofence',
        );
        this.assertSettingOwnership(
          context,
          input.biometricVerificationMode !== undefined,
          branch.biometricOwnerSource,
          branch.biometricOwnerClientId,
          'biometric',
        );
        const updated = await tx.branch.update({
          where: { id: branch.id },
          data: {
            geofenceMode: input.geofenceMode,
            biometricVerificationMode: input.biometricVerificationMode,
          },
        });
        await this.locations.syncWorkLocations(
          tx,
          context.organizationId,
          branch.id,
          input.workLocations,
        );
        await this.audit.record(
          context,
          {
            entityType: 'BRANCH',
            entityId: branch.id,
            action: 'ATTENDANCE_PREFERENCES_UPDATED',
            beforeState: jsonSnapshot(branch),
            afterState: jsonSnapshot(updated),
          },
          tx,
        );
        return toPreferencesDto(updated);
      }
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      this.assertSettingOwnership(
        context,
        input.geofenceMode !== undefined || input.workLocations !== undefined,
        settings.geofenceOwnerSource,
        settings.geofenceOwnerClientId,
        'geofence',
      );
      this.assertSettingOwnership(
        context,
        input.biometricVerificationMode !== undefined,
        settings.biometricOwnerSource,
        settings.biometricOwnerClientId,
        'biometric',
      );
      const updated = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: {
          geofenceMode: input.geofenceMode,
          biometricVerificationMode: input.biometricVerificationMode,
        },
      });
      await this.locations.syncWorkLocations(tx, context.organizationId, null, input.workLocations);
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'ATTENDANCE_PREFERENCES_UPDATED',
          beforeState: jsonSnapshot(settings),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return toPreferencesDto(updated);
    });
  }

  async getPreferences(context: DomainContext, branchId?: string) {
    requirePermission(context, 'attendance.preferences.read');
    return this.database.run(context, async (tx) => {
      if (branchId) {
        const branch = await tx.branch.findFirst({
          where: { id: branchId, organizationId: context.organizationId },
          select: {
            id: true,
            geofenceMode: true,
            biometricVerificationMode: true,
            geofenceOwnerSource: true,
            biometricOwnerSource: true,
          },
        });
        if (!branch) throw new NotFoundError('Branch');
        return branch;
      }
      return tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: {
          organizationId: true,
          geofenceMode: true,
          biometricVerificationMode: true,
          geofenceOwnerSource: true,
          biometricOwnerSource: true,
        },
      });
    });
  }

  private assertSettingOwnership(
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

  private toRecordDto(record: {
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
  private toPunchDto(punch: {
    id: string;
    punchType: string;
    occurredAt: Date;
    isWithinGeofence: boolean | null;
    distanceFromLocationMeters: unknown;
    biometricVerified: boolean;
    webauthnCredentialId: string | null;
  }) {
    return {
      id: punch.id,
      punchType: punch.punchType,
      occurredAt: punch.occurredAt,
      isWithinGeofence: punch.isWithinGeofence,
      distanceFromLocationMeters: punch.distanceFromLocationMeters,
      biometricVerified: punch.biometricVerified,
      webauthnCredentialId: punch.webauthnCredentialId,
    };
  }
}

function toPreferencesDto(value: {
  id?: string;
  organizationId?: string;
  geofenceMode: GeofenceMode | null;
  biometricVerificationMode: BiometricVerificationMode | null;
  geofenceOwnerSource: string;
  biometricOwnerSource: string;
}) {
  return {
    id: value.id,
    organizationId: value.organizationId,
    geofenceMode: value.geofenceMode,
    biometricVerificationMode: value.biometricVerificationMode,
    geofenceOwnerSource: value.geofenceOwnerSource,
    biometricOwnerSource: value.biometricOwnerSource,
  };
}

function encodeAttendanceCursor(id: string | undefined) {
  return id ? Buffer.from(JSON.stringify({ id })).toString('base64url') : undefined;
}

function decodeAttendanceCursor(cursor: string) {
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function dayStatusFromSnapshot(value: unknown): AttendanceDayStatus | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const status = (value as Record<string, unknown>).dayStatus;
  return typeof status === 'string' &&
    Object.values(AttendanceDayStatus).includes(status as AttendanceDayStatus)
    ? (status as AttendanceDayStatus)
    : undefined;
}
