'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  type AttendanceCorrection,
  type AttendanceRecord,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { attendanceRepository } from '../repositories/attendance.repository';
import { useAsyncResource } from './use-async-resource';
import { localDateKey } from './use-attendance';
import { useCursorPages } from './use-cursor-pages';
import { useDataChanged } from '../lib/data-events';

type Loaded = {
  records: AttendanceRecord[];
  corrections: AttendanceCorrection[];
  inbox: AttendanceCorrection[];
  nextCursor?: string;
};

/**
 * Organization-wide attendance for the admin view, plus the correction queue.
 *
 * The correction list and approval inbox come from service methods that were already written and
 * reachable over federation, but had no native HTTP route until this module was reconciled.
 */
export function useAttendanceAdmin(
  from: string,
  to: string,
  search = '',
  section = 'records',
  correctionStatus = 'ALL',
  departmentId = '',
  dayStatus = 'ALL',
) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'attendance.read');
  const canDecide = hasPermission(permissions, 'attendance.corrections.decide');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const paging = useCursorPages(
    JSON.stringify([
      organizationId,
      from,
      to,
      search,
      section,
      correctionStatus,
      departmentId,
      dayStatus,
    ]),
  );

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [page, corrections, inbox] = await Promise.all([
        section === 'records'
          ? attendanceRepository.list(organizationId!, {
              from,
              to,
              search: search || undefined,
              departmentId: departmentId || undefined,
              dayStatus: dayStatus === 'ALL' ? undefined : dayStatus,
              cursor: paging.cursor,
              limit: 10,
            })
          : Promise.resolve({ records: [] as AttendanceRecord[], nextCursor: undefined }),
        section === 'corrections'
          ? attendanceRepository.listCorrectionPage(organizationId!, {
              limit: 10,
              cursor: paging.cursor,
              search,
              status: correctionStatus === 'ALL' ? undefined : correctionStatus,
            })
          : Promise.resolve({ corrections: [] as AttendanceCorrection[], nextCursor: undefined }),
        // The inbox is personal to the approver; without decide rights it is simply empty.
        canDecide && section === 'corrections'
          ? attendanceRepository.correctionInbox(organizationId!)
          : Promise.resolve([]),
      ]);
      return {
        records: page.records,
        nextCursor: section === 'corrections' ? corrections.nextCursor : page.nextCursor,
        corrections: corrections.corrections,
        inbox,
      };
    },
    [
      organizationId,
      from,
      to,
      search,
      paging.cursor,
      section,
      canDecide,
      correctionStatus,
      departmentId,
      dayStatus,
    ],
    {
      enabled: Boolean(organizationId) && canRead && section !== 'policy',
      preservePreviousDataKey: organizationId ? `${organizationId}:${section}` : null,
    },
  );

  useDataChanged(['attendance'], resource.refetch);

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
    paging,
    nextCursor: resource.data?.nextCursor,
    records: resource.data?.records ?? [],
    corrections: resource.data?.corrections ?? [],
    inbox: resource.data?.inbox ?? [],
    employees: [],
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

/** Default admin range: the full current calendar month. */
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: localDateKey(first), to: localDateKey(last) };
}

export type AttendanceAdminState = ReturnType<typeof useAttendanceAdmin>;
