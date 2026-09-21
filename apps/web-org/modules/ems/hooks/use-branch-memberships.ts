'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission, type Branch, type BranchMembership } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';
import { branchMembershipsRepository } from '../repositories/branch-memberships.repository';
import { workforceRepository } from '../repositories/workforce.repository';

/**
 * One employee's branches and the four things that can be done with them. Every change answers
 * with the full history, which replaces what is on screen, so a transfer's effect on the old
 * primary shows without a second request.
 */
export function useBranchMemberships(employeeId: string) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId ?? '';
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'employees.read');
  const canWrite = hasPermission(permissions, 'employees.write');

  const resource = useAsyncResource<{ rows: BranchMembership[]; branches: Branch[] }>(
    async () => {
      // The branch list only feeds the forms; the history carries its own names. Someone who may
      // read an employee but not the branch list still sees their branches.
      const [rows, branches] = await Promise.all([
        branchMembershipsRepository.list(organizationId, employeeId),
        canWrite ? workforceRepository.listBranches(organizationId) : Promise.resolve([]),
      ]);
      return { rows, branches };
    },
    [organizationId, employeeId, canWrite],
    { enabled: Boolean(organizationId) && canRead },
  );
  // Keyed by employee, so opening someone else never shows the previous person's history.
  const [latest, setLatest] = useState<{ employeeId: string; rows: BranchMembership[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (change: () => Promise<BranchMembership[]>, fallback: string) => {
      setBusy(true);
      setError(null);
      try {
        setLatest({ employeeId, rows: await change() });
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : fallback);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [employeeId],
  );

  return {
    canRead,
    canWrite,
    loading: resource.loading,
    loadError: resource.error,
    rows: (latest?.employeeId === employeeId ? latest.rows : null) ?? resource.data?.rows ?? [],
    // Deactivated branches can hold history but take nobody new.
    branches: (resource.data?.branches ?? []).filter((branch) => branch.status !== 'DEACTIVATED'),
    busy,
    error,
    clearError: () => setError(null),
    add: (input: { branchId: string; startsOn: string; endsOn?: string }) =>
      run(
        () => branchMembershipsRepository.add(organizationId, employeeId, input),
        'The branch could not be added.',
      ),
    transfer: (input: { branchId: string; effectiveFrom: string }) =>
      run(
        () => branchMembershipsRepository.transfer(organizationId, employeeId, input),
        'The transfer could not be saved.',
      ),
    end: (membershipId: string, endsOn: string) =>
      run(
        () => branchMembershipsRepository.end(organizationId, employeeId, membershipId, endsOn),
        'The branch could not be ended.',
      ),
    cancel: (membershipId: string) =>
      run(
        () => branchMembershipsRepository.cancel(organizationId, employeeId, membershipId),
        'The branch could not be cancelled.',
      ),
  };
}

export type BranchMembershipsState = ReturnType<typeof useBranchMemberships>;
