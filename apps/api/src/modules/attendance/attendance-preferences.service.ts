import { Injectable } from '@nestjs/common';
import { AttendanceLocationService } from './attendance-location.service';
import {
  AutoCheckOutMode,
  GeofenceMode,
  BiometricVerificationMode,
} from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import type { MissedCheckOutPolicy } from '@smarteam/contracts';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { type WorkLocationInput } from './attendance-location.service';
import { assertSettingOwnership, toPreferencesDto, workDateInTimeZone } from './attendance-shared';
import {
  parseMissedCheckOutPolicy,
  hasScheduledMissedCheckOutHistory,
  hasScheduledMissedCheckOutPolicy,
  readMissedCheckOutPolicy,
  withMissedCheckOutPolicy,
} from './attendance-missed-checkout-policy';

/**
 * Per-branch attendance settings: how punches may be captured and what the day boundaries are.
 *
 * Configuration, not transaction. Nothing here writes an attendance record; it decides what the
 * services above are allowed to accept.
 */
@Injectable()
export class AttendancePreferencesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly locations: AttendanceLocationService,
  ) {}

  async updatePreferences(
    context: DomainContext,
    input: {
      branchId?: string;
      geofenceMode?: GeofenceMode;
      biometricVerificationMode?: BiometricVerificationMode;
      attendanceSessionMode?: 'SINGLE' | 'MULTIPLE';
      workLocations?: WorkLocationInput[];
      /** Organization-wide, so these are refused with a branch. */
      autoCheckOutMode?: AutoCheckOutMode;
      autoCheckOutAt?: string;
      missedCheckOutPolicy?: Record<string, unknown>;
    },
  ) {
    requirePermission(context, 'attendance.preferences.write');
    if (
      input.geofenceMode === undefined &&
      input.biometricVerificationMode === undefined &&
      input.workLocations === undefined &&
      input.attendanceSessionMode === undefined &&
      input.autoCheckOutMode === undefined &&
      input.autoCheckOutAt === undefined &&
      input.missedCheckOutPolicy === undefined
    )
      throw new ConflictError('At least one attendance preference must be supplied');
    if (
      input.branchId &&
      (input.autoCheckOutMode !== undefined || input.autoCheckOutAt !== undefined)
    )
      throw new ConflictError('Automatic check-out is set for the organization, not a branch');
    return this.database.run(context, async (tx) => {
      if (input.branchId) {
        const branch = await tx.branch.findFirst({
          where: { id: input.branchId, organizationId: context.organizationId },
        });
        if (!branch) throw new NotFoundError('Branch');
        assertSettingOwnership(
          context,
          input.geofenceMode !== undefined || input.workLocations !== undefined,
          branch.geofenceOwnerSource,
          branch.geofenceOwnerClientId,
          'geofence',
        );
        assertSettingOwnership(
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
      assertSettingOwnership(
        context,
        input.geofenceMode !== undefined || input.workLocations !== undefined,
        settings.geofenceOwnerSource,
        settings.geofenceOwnerClientId,
        'geofence',
      );
      assertSettingOwnership(
        context,
        input.biometricVerificationMode !== undefined,
        settings.biometricOwnerSource,
        settings.biometricOwnerClientId,
        'biometric',
      );

      const existingMeta =
        settings.metadata && typeof settings.metadata === 'object'
          ? (settings.metadata as Record<string, unknown>)
          : {};
      const updatedMeta =
        input.attendanceSessionMode !== undefined
          ? { ...existingMeta, attendanceSessionMode: input.attendanceSessionMode }
          : existingMeta;

      const currentMissedPolicy = readMissedCheckOutPolicy(
        existingMeta,
        settings.autoCheckOutMode,
        settings.autoCheckOutAt,
      );
      const requestedMissedPolicy = input.missedCheckOutPolicy
        ? parseMissedCheckOutPolicy(input.missedCheckOutPolicy)
        : input.autoCheckOutMode !== undefined || input.autoCheckOutAt !== undefined
          ? {
              ...currentMissedPolicy,
              ...(input.autoCheckOutMode !== undefined
                ? {
                    resolutionMethod:
                      input.autoCheckOutMode === 'REVIEW_REQUIRED'
                        ? ('PROVISIONAL_AUTO_CLOSE' as const)
                        : ('LEAVE_OPEN' as const),
                  }
                : {}),
              ...(input.autoCheckOutAt !== undefined
                ? { configuredTime: input.autoCheckOutAt }
                : {}),
            }
          : undefined;
      const missedCheckOutPolicy: MissedCheckOutPolicy | undefined = requestedMissedPolicy
        ? {
            ...requestedMissedPolicy,
            version: currentMissedPolicy.version + 1,
            effectiveFrom: workDateInTimeZone(
              new Date(),
              (
                await tx.organization.findUniqueOrThrow({
                  where: { id: context.organizationId },
                  select: { timezone: true },
                })
              ).timezone,
            ),
          }
        : undefined;
      const nextMeta = missedCheckOutPolicy
        ? withMissedCheckOutPolicy(updatedMeta, missedCheckOutPolicy, currentMissedPolicy)
        : updatedMeta;
      const autoCheckOutMode = missedCheckOutPolicy
        ? hasScheduledMissedCheckOutPolicy(missedCheckOutPolicy) ||
          hasScheduledMissedCheckOutHistory(nextMeta)
          ? AutoCheckOutMode.REVIEW_REQUIRED
          : AutoCheckOutMode.DISABLED
        : input.autoCheckOutMode;

      const updated = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: {
          geofenceMode: input.geofenceMode,
          biometricVerificationMode: input.biometricVerificationMode,
          autoCheckOutMode,
          ...(missedCheckOutPolicy
            ? { autoCheckOutAt: timeOnly(missedCheckOutPolicy.configuredTime) }
            : input.autoCheckOutAt
              ? { autoCheckOutAt: timeOnly(input.autoCheckOutAt) }
              : {}),
          metadata: nextMeta as Prisma.InputJsonValue,
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
        return toPreferencesDto(branch);
      }
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: {
          organizationId: true,
          geofenceMode: true,
          biometricVerificationMode: true,
          geofenceOwnerSource: true,
          biometricOwnerSource: true,
          metadata: true,
          autoCheckOutMode: true,
          autoCheckOutAt: true,
        },
      });
      return toPreferencesDto(settings);
    });
  }

  /**
   * Employee self-scoping, matching the convention already used by Timesheets, Compliance and
   * Payroll: a plain `attendance.read` may only see the caller's own records, `attendance.read.all`
   * (or the tenant wildcard) may read other employees, and federation grants keep the read breadth
   * their scope already carries.
   */
}

/** `23:59` as the time-only value Postgres stores, which Prisma reads back as a 1970 instant. */
function timeOnly(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new ConflictError('The automatic check-out time must be HH:MM');
  return new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2]), 0));
}
