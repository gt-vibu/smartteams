'use client';

import { hasPermission } from '@smarteam/contracts';
import { useOptionalSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';
import { useDebouncedValue } from './use-debounced-value';
import { useCursorPages } from './use-cursor-pages';
import { employeeReadRepository } from '../repositories/employee-read.repository';

/** One bounded page on demand; selected identities are independent of the current search. */
export function useEmployeeSearch(
  search: string,
  enabled: boolean,
  selected: readonly string[] = [],
) {
  const auth = useOptionalSession();
  const organizationId = auth?.session?.organizationId;
  const remote = Boolean(
    organizationId && hasPermission(auth.persona?.permissions ?? [], 'employees.read'),
  );
  const term = useDebouncedValue(search.trim());
  const paging = useCursorPages(JSON.stringify([organizationId, term]));
  const page = useAsyncResource(
    () =>
      employeeReadRepository.page(organizationId!, {
        search: term,
        status: 'ACTIVE',
        limit: 10,
        cursor: paging.cursor,
      }),
    [organizationId, term, paging.cursor],
    { enabled: remote && enabled },
  );
  const selectionKey = [...new Set(selected)].sort().join(',');
  const identities = useAsyncResource(
    () =>
      employeeReadRepository.identities(organizationId!, selectionKey.split(',').filter(Boolean)),
    [organizationId, selectionKey],
    { enabled: remote && Boolean(selectionKey) },
  );
  return {
    remote,
    employees: page.data?.employees ?? [],
    selectedEmployees: identities.data ?? [],
    paging,
    nextCursor: page.data?.nextCursor,
    loading: remote && (page.loading || page.refreshing || search.trim() !== term),
    error: page.error ?? identities.error,
    refetch: page.refetch,
  };
}
