'use client';

import { useMemo } from 'react';
import { hasPermission, type EmployeeDirectoryEntry } from '@smarteam/contracts';
import { useSession } from './auth-context';
import {
  employeeReadRepository,
  type EmployeeReadFilters,
} from '../repositories/employee-read.repository';
import { useCursorPages } from './use-cursor-pages';
import { useDebouncedValue } from './use-debounced-value';
import { useAsyncResource } from './use-async-resource';

/**
 * The organization's people, with the reporting line and department attached.
 *
 * One bounded request per page rather than one per employee. The reporting view asks for a root
 * level or one manager's direct reports, keeping each step bounded even across a large tenant.
 *
 * What the API returns is what the caller may see. An ordinary employee gets themselves, so these
 * views render a tree of one rather than an error — which is the correct answer for someone
 * without organization-wide read.
 */
export function useEmployeeDirectory(filters: EmployeeReadFilters = {}, enabled = true) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'employees.read');

  const search = useDebouncedValue(filters.search?.trim() ?? '');
  const paging = useCursorPages(
    JSON.stringify([
      organizationId,
      search,
      filters.status,
      filters.department,
      filters.reportingManager,
      filters.joinedFrom,
      filters.order,
      filters.hasDirectReports,
      filters.hasLogin,
      filters.limit,
    ]),
  );
  const summary = useAsyncResource(
    () => employeeReadRepository.summary(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );
  const resource = useAsyncResource(
    () =>
      employeeReadRepository.directoryPage(organizationId!, {
        ...filters,
        search,
        limit: filters.limit ?? 10,
        cursor: paging.cursor,
      }),
    [
      organizationId,
      search,
      filters.status,
      filters.department,
      filters.reportingManager,
      filters.joinedFrom,
      filters.order,
      filters.hasDirectReports,
      filters.hasLogin,
      filters.limit,
      paging.cursor,
    ],
    {
      enabled: enabled && Boolean(organizationId) && canRead,
      preservePreviousDataKey: organizationId
        ? `${organizationId}:${filters.status ?? 'all'}:${filters.reportingManager && filters.reportingManager !== 'ROOT' ? filters.reportingManager : 'all'}`
        : null,
    },
  );

  const entries = useMemo(() => resource.data?.entries ?? [], [resource.data]);

  /** Departments, derived. `department` is free text on the employment record, not an entity. */
  const departments = useMemo(() => groupByDepartment(entries), [entries]);

  return {
    entries,
    summary: summary.data,
    summaryLoading: summary.loading,
    summaryError: summary.error,
    paging,
    nextCursor: resource.data?.nextCursor,
    refreshing: resource.refreshing,
    departments,
    /** True when the page cap was reached, so a short list is never read as the whole company. */
    truncated: Boolean(resource.data?.nextCursor),
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden || !canRead,
    refetch: async () => {
      await Promise.all([resource.refetch(), summary.refetch()]);
    },
  };
}

export type DepartmentGroup = { name: string; members: EmployeeDirectoryEntry[] };

function groupByDepartment(entries: EmployeeDirectoryEntry[]): DepartmentGroup[] {
  const groups = new Map<string, EmployeeDirectoryEntry[]>();
  for (const entry of entries) {
    // Trimmed and case-folded for grouping only — "Engineering" and "engineering " are one
    // department typed twice, not two.
    const key = entry.department?.trim() || 'Unassigned';
    const existing = groups.get(key.toLowerCase());
    if (existing) existing.push(entry);
    else groups.set(key.toLowerCase(), [entry]);
  }
  return [...groups.entries()]
    .map(([, members]) => ({
      name: members[0]?.department?.trim() || 'Unassigned',
      members,
    }))
    .sort((a, b) => {
      // Unassigned last: it is the absence of a department, not one of them.
      if (a.name === 'Unassigned') return 1;
      if (b.name === 'Unassigned') return -1;
      return a.name.localeCompare(b.name);
    });
}
