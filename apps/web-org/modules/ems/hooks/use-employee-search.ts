'use client';

import { hasPermission } from '@smarteam/contracts';
import { useOptionalSession } from './auth-context';
import { useEffect, useState } from 'react';
import { useAsyncResource } from './use-async-resource';
import { useDebouncedValue } from './use-debounced-value';
import { useCursorPages } from './use-cursor-pages';
import { employeeReadRepository } from '../repositories/employee-read.repository';

type EmployeeSearchData = Awaited<ReturnType<typeof employeeReadRepository.page>> & {
  searchKey: string;
};

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
  const searchKey = JSON.stringify([organizationId, term]);
  const paging = useCursorPages(searchKey);
  const page = useAsyncResource(
    () =>
      employeeReadRepository
        .page(organizationId!, {
          search: term,
          status: 'ACTIVE',
          limit: 10,
          cursor: paging.cursor,
        })
        .then((result) => ({ ...result, searchKey })),
    [organizationId, term, paging.cursor],
    { enabled: remote && enabled },
  );
  const [loaded, setLoaded] = useState<{ key: string; employees: EmployeeSearchData['employees'] }>(
    {
      key: searchKey,
      employees: [],
    },
  );
  const accumulated = loaded.key === searchKey ? loaded.employees : [];
  useEffect(() => {
    const result = page.data;
    if (!result || result.searchKey !== searchKey) return;
    setLoaded((previous) => {
      const existing = previous.key === searchKey ? previous.employees : [];
      const seen = new Set(existing.map((employee) => employee.id));
      return {
        key: searchKey,
        employees: [...existing, ...result.employees.filter((employee) => !seen.has(employee.id))],
      };
    });
  }, [page.data, searchKey]);
  const selectionKey = [...new Set(selected)].sort().join(',');
  const identities = useAsyncResource(
    () =>
      employeeReadRepository.identities(organizationId!, selectionKey.split(',').filter(Boolean)),
    [organizationId, selectionKey],
    { enabled: remote && Boolean(selectionKey) },
  );
  return {
    remote,
    employees: accumulated,
    selectedEmployees: identities.data ?? [],
    paging,
    nextCursor: page.data?.nextCursor,
    loading:
      remote &&
      (search.trim() !== term || (!accumulated.length && (page.loading || page.refreshing))),
    loadingMore: remote && accumulated.length > 0 && (page.loading || page.refreshing),
    error: page.error ?? identities.error,
    refetch: page.refetch,
  };
}
