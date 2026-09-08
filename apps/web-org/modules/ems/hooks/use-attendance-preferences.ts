'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission, type AttendancePreferences } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { attendanceRepository } from '../repositories/attendance.repository';
import { useAsyncResource } from './use-async-resource';

/**
 * Attendance policy: geofencing and biometric verification.
 *
 * `POST /attendance/preferences` has always existed; the matching `GET` did not, so the app
 * could write a policy it could never read back. Both are wired now.
 *
 * `geofenceOwnerSource` / `biometricOwnerSource` say whether the effective value came from the
 * organization or from a branch override — the UI surfaces that rather than implying every value
 * was set here.
 */
export function useAttendancePreferences(branchId?: string) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'attendance.preferences.read');
  const canWrite = hasPermission(permissions, 'attendance.preferences.write');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resource = useAsyncResource<AttendancePreferences>(
    () => attendanceRepository.getPreferences(organizationId!, branchId),
    [organizationId, branchId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const save = useCallback(
    async (input: {
      geofenceMode?: string;
      biometricVerificationMode?: string;
      attendanceSessionMode?: 'SINGLE' | 'MULTIPLE';
    }) => {
      if (!organizationId) return false;
      setSaving(true);
      setSaveError(null);
      try {
        await attendanceRepository.updatePreferences(organizationId, {
          ...input,
          ...(branchId ? { branchId } : {}),
        });
        await resource.refetch();
        return true;
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : 'The policy could not be saved.');
        await resource.refetch();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, branchId, resource],
  );

  return {
    preferences: resource.data,
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    save,
    canRead,
    canWrite,
  };
}
