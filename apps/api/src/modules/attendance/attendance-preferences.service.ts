import { Injectable } from '@nestjs/common';
import { AttendanceLocationService } from './attendance-location.service';
import {
  AutoCheckOutMode,
  GeofenceMode,
  BiometricVerificationMode,
} from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { type AttendanceTransaction, type WorkLocationInput } from './attendance-location.service';
import { assertSettingOwnership, toPreferencesDto } from './attendance-shared';
import { canActForAllEmployees } from '../employees/employee-scope';

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
      requireGps?: boolean | null;
      geofenceMode?: GeofenceMode;
      biometricVerificationMode?: BiometricVerificationMode;
      attendanceSessionMode?: 'SINGLE' | 'MULTIPLE';
      workLocations?: WorkLocationInput[];
      /** Organization-wide, so these are refused with a branch. */
      autoCheckOutMode?: AutoCheckOutMode;
      autoCheckOutAt?: string;
    },
  ) {
    requirePermission(context, 'attendance.preferences.write');
    if (context.branchId && input.branchId && input.branchId !== context.branchId)
      throw new ForbiddenDomainError('Attendance preferences are restricted to the active branch');
    input = { ...input, branchId: input.branchId ?? context.branchId };
    if (input.requireGps === null && !input.branchId)
      throw new ConflictError(
        'Organization GPS capture must be enabled or disabled; only a branch may inherit',
      );
    if (
      input.geofenceMode === undefined &&
      input.requireGps === undefined &&
      input.biometricVerificationMode === undefined &&
      input.workLocations === undefined &&
      input.attendanceSessionMode === undefined &&
      input.autoCheckOutMode === undefined &&
      input.autoCheckOutAt === undefined
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
          input.geofenceMode !== undefined ||
            input.workLocations !== undefined ||
            input.requireGps !== undefined,
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
            requireGps: input.requireGps,
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
        return this.readPreferences(tx, context.organizationId, branch.id, true);
      }
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      assertSettingOwnership(
        context,
        input.geofenceMode !== undefined ||
          input.workLocations !== undefined ||
          input.requireGps !== undefined,
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

      const updated = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: {
          geofenceMode: input.geofenceMode,
          requireGps: input.requireGps ?? undefined,
          biometricVerificationMode: input.biometricVerificationMode,
          autoCheckOutMode: input.autoCheckOutMode,
          ...(input.autoCheckOutAt ? { autoCheckOutAt: timeOnly(input.autoCheckOutAt) } : {}),
          metadata: updatedMeta as Prisma.InputJsonValue,
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
      return this.readPreferences(tx, context.organizationId, undefined, true);
    });
  }

  async getPreferences(context: DomainContext, branchId?: string) {
    requirePermission(context, 'attendance.preferences.read');
    if (context.branchId && branchId && branchId !== context.branchId)
      throw new ForbiddenDomainError('Attendance preferences are restricted to the active branch');
    return this.database.run(context, async (tx) => {
      const self = !canActForAllEmployees(context, 'attendance.read.all')
        ? await tx.employee.findFirst({
            where: {
              organizationId: context.organizationId,
              userId: context.actor.userId,
              status: 'ACTIVE',
            },
            select: {
              primaryBranchId: true,
              geofenceMode: true,
              branchAssignments: {
                where: {
                  startsOn: { lte: new Date() },
                  OR: [{ endsOn: null }, { endsOn: { gte: new Date() } }],
                },
                orderBy: { startsOn: 'desc' },
                select: { branchId: true, isPrimary: true },
              },
            },
          })
        : null;
      const effectiveBranchId =
        branchId ??
        context.branchId ??
        self?.primaryBranchId ??
        self?.branchAssignments.find((assignment) => assignment.isPrimary)?.branchId;
      const preferences = await this.readPreferences(tx, context.organizationId, effectiveBranchId);
      return self?.geofenceMode ? { ...preferences, geofenceMode: self.geofenceMode } : preferences;
    });
  }

  private async readPreferences(
    tx: AttendanceTransaction,
    organizationId: string,
    branchId?: string,
    validateLocations = false,
  ) {
    const settings = await tx.organizationSettings.findUniqueOrThrow({ where: { organizationId } });
    const branch = branchId
      ? await tx.branch.findFirst({ where: { id: branchId, organizationId } })
      : null;
    if (branchId && !branch) throw new NotFoundError('Branch');
    const workLocations = await tx.workLocation.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : { branchId: null }),
      },
      orderBy: { name: 'asc' },
    });
    if (
      validateLocations &&
      (branch?.geofenceMode ?? settings.geofenceMode) === GeofenceMode.REQUIRED &&
      !workLocations.length
    )
      throw new ConflictError(
        'Configure an active attendance location before enabling geofence enforcement',
      );
    return {
      ...toPreferencesDto(
        branch
          ? {
              ...branch,
              requireGps: branch.requireGps ?? settings.requireGps,
              geofenceMode: branch.geofenceMode ?? settings.geofenceMode,
              biometricVerificationMode:
                branch.biometricVerificationMode ?? settings.biometricVerificationMode,
              metadata: settings.metadata,
            }
          : settings,
      ),
      workLocations: workLocations.map((location) => ({
        id: location.id,
        branchId: location.branchId,
        name: location.name,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        radiusMeters: Number(location.radiusMeters),
      })),
    };
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
