'use client';
import { useDataChanged } from '../lib/data-events';

import { useMemo } from 'react';
import { hasPermission, type Project, type Team } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useCursorPages } from './use-cursor-pages';
import { useDebouncedValue } from './use-debounced-value';
import {
  employeeReadRepository,
  type EmployeeReadFilters,
} from '../repositories/employee-read.repository';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource } from './use-async-resource';

/**
 * Workforce data, scoped to the signed-in user's organization.
 *
 * The organization id comes from the session, so a screen cannot request another tenant's data
 * by construction. Each hook is additionally gated on the permission the API requires, which
 * keeps the UI from firing a request that is guaranteed to 403 — the server still enforces it.
 */

function useOrganizationId(): string | null {
  const { session } = useSession();
  return session?.organizationId || null;
}

export function useEmployees(
  filters: EmployeeReadFilters & { enabled?: boolean; ids?: string[] } = {},
) {
  // `enabled` controls whether this client hook makes a request. It is not an employee
  // directory filter and must never be serialized into the API query string.
  const { enabled = true, ids: requestedIds, ...directoryFilters } = filters;
  const organizationId = useOrganizationId();
  const { persona } = useSession();
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'employees.read');

  const search = useDebouncedValue(directoryFilters.search?.trim() ?? '');
  const ids = requestedIds?.join(',');
  const paging = useCursorPages(
    JSON.stringify([
      organizationId,
      search,
      directoryFilters.status,
      directoryFilters.joinedFrom,
      directoryFilters.order,
      directoryFilters.hasDirectReports,
      directoryFilters.hasLogin,
      ids,
    ]),
  );
  const state = useAsyncResource(
    async () =>
      ids !== undefined
        ? {
            employees: await employeeReadRepository.identities(
              organizationId!,
              ids.split(',').filter(Boolean),
            ),
            nextCursor: undefined,
          }
        : employeeReadRepository.page(organizationId!, {
            ...directoryFilters,
            search,
            limit: directoryFilters.limit ?? 10,
            cursor: paging.cursor,
          }),
    [
      organizationId,
      search,
      directoryFilters.status,
      paging.cursor,
      ids,
      directoryFilters.joinedFrom,
      directoryFilters.order,
    ],
    {
      enabled: enabled && Boolean(organizationId) && canRead,
      preservePreviousDataKey: ids === undefined ? organizationId : null,
    },
  );
  useDataChanged(['workforce'], state.refetch);
  return {
    ...state,
    data: state.data?.employees ?? null,
    paging,
    nextCursor: state.data?.nextCursor,
    canRead,
  };
}

export function useTeams() {
  const organizationId = useOrganizationId();
  const { persona } = useSession();
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'teams.read');

  const state = useAsyncResource<Team[]>(
    () => workforceRepository.listTeams(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );
  return { ...state, canRead };
}

export function useProjects() {
  const organizationId = useOrganizationId();
  const { persona } = useSession();
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'projects.read');

  const state = useAsyncResource<Project[]>(
    () => workforceRepository.listProjects(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );
  return { ...state, canRead };
}
