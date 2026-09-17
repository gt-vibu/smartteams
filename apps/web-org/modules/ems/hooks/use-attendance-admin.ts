'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  type AttendanceCorrection,
  type AttendanceRecord,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { attendanceRepository } from '../repositories/attendance.repository';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';
import { localDateKey } from './use-attendance';

type Loaded = {
  records: AttendanceRecord[];
  corrections: AttendanceCorrection[];
  inbox: AttendanceCorrection[];
};

/**
 * Organization-wide attendance for the admin view, plus the correction queue.
 *
 * The correction list and approval inbox come from service methods that were already written and
 * reachable over federation, but had no native HTTP route until this module was reconciled.
 */
export function useAttendanceAdmin(from: string, to: string) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'attendance.read');
  const canDecide = hasPermission(permissions, 'attendance.corrections.decide');
  const canReadEmployees = hasPermission(permissions, 'employees.read');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [page, corrections, inbox] = await Promise.all([
        attendanceRepository.list(organizationId!, { from, to, limit: 500 }),
        attendanceRepository.listCorrections(organizationId!, { limit: 200 }),
        // The inbox is personal to the approver; without decide rights it is simply empty.
        canDecide ? attendanceRepository.correctionInbox(organizationId!) : Promise.resolve([]),
      ]);
      return { records: page.records, corrections, inbox };
    },
    [organizationId, from, to, canDecide],
    { enabled: Boolean(organizationId) && canRead },
  );

  const employeesResource = useAsyncResource(
    () => workforceRepository.listEmployees(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadEmployees },
  );

  const decide = useCallback(
    async (correctionId: string, status: 'APPROVED' | 'REJECTED', comment: string) => {
      if (!organizationId) return false;
      setSaving(true);
      setSaveError(null);
      try {
        await attendanceRepository.decideCorrection(organizationId, correctionId, status, comment);
        await resource.refetch();
        return true;
      } catch (caught) {
        setSaveError(
          caught instanceof Error ? caught.message : 'The decision could not be recorded.',
        );
        await resource.refetch();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, resource],
  );

  return {
    records: resource.data?.records ?? [],
    corrections: resource.data?.corrections ?? [],
    inbox: resource.data?.inbox ?? [],
    employees: employeesResource.data ?? [],
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    decide,
    canRead,
    canDecide,
  };
}

/** Default admin range: the current month to date. */
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: localDateKey(first), to: localDateKey(now) };
}

export type AttendanceAdminState = ReturnType<typeof useAttendanceAdmin>;
