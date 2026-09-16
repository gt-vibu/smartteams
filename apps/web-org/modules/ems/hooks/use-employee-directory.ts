'use client';

import { useMemo } from 'react';
import { hasPermission, type EmployeeDirectoryEntry } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';

/**
 * The organization's people, with the reporting line and department attached.
 *
 * One request per page rather than one per employee: the department grouping and the reporting
 * tree below are both derived from the same fetched rows, so adding a view costs nothing extra.
 *
 * What the API returns is what the caller may see. An ordinary employee gets themselves, so these
 * views render a tree of one rather than an error — which is the correct answer for someone
 * without organization-wide read.
 */
export function useEmployeeDirectory() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'employees.read');

  const resource = useAsyncResource(
    () => workforceRepository.listDirectory(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const entries = useMemo(() => resource.data?.entries ?? [], [resource.data]);

  /** Departments, derived. `department` is free text on the employment record, not an entity. */
  const departments = useMemo(() => groupByDepartment(entries), [entries]);

  /** The reporting tree, derived from `managerEmployeeId`. There is no second hierarchy table. */
  const reportingTree = useMemo(() => buildTree(entries), [entries]);

  return {
    entries,
    departments,
    reportingTree,
    /** True when the page cap was reached, so a short list is never read as the whole company. */
    truncated: resource.data?.truncated ?? false,
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden || !canRead,
    refetch: resource.refetch,
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

export type ReportingNode = { employee: EmployeeDirectoryEntry; reports: ReportingNode[] };

/**
 * Roots are the people whose manager is not in the fetched set — the actual top of the
 * organization, and also anyone whose manager fell outside a truncated page. Both belong at the
 * top level; the alternative is silently dropping them from the tree.
 */
function buildTree(entries: EmployeeDirectoryEntry[]): ReportingNode[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const nodes = new Map<string, ReportingNode>(
    entries.map((entry) => [entry.id, { employee: entry, reports: [] }]),
  );

  const roots: ReportingNode[] = [];
  for (const entry of entries) {
    const node = nodes.get(entry.id);
    if (!node) continue;
    const parent = entry.managerEmployeeId ? nodes.get(entry.managerEmployeeId) : undefined;
    if (parent && byId.has(entry.managerEmployeeId!) && entry.managerEmployeeId !== entry.id)
      parent.reports.push(node);
    else roots.push(node);
  }

  const sort = (list: ReportingNode[]) => {
    list.sort((a, b) => a.employee.lastName.localeCompare(b.employee.lastName));
    for (const node of list) sort(node.reports);
  };
  sort(roots);
  return roots;
}
