'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type Branch, type Organization } from '@smarteam/contracts';
import { useSession } from './auth-context';
import {
  organizationRepository,
  type BranchInput,
  type OrganizationUpdate,
} from '../repositories/organization.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * The organization profile and its branches.
 *
 * Replaces a hook built on `organization.json` and four `localStorage` keys. Renaming the
 * organization there changed nothing on the server; the new name survived exactly as long as the
 * browser's storage did, and every other user saw the old one.
 *
 * The hook exposes only what the backend models. Announcements, quick links, departments,
 * milestones and the reporting hierarchy are not returned at all — the screens for them say they
 * are not available rather than reading a fixture.
 */
export function useOrganization() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadOrganization = hasPermission(permissions, 'organizations.read');
  const canUpdateOrganization = hasPermission(permissions, 'organizations.update');
  const canReadBranches = hasPermission(permissions, 'branches.read');
  const canWriteBranches = hasPermission(permissions, 'branches.write');

  const organizationResource = useAsyncResource<Organization>(
    () => organizationRepository.get(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadOrganization },
  );

  const branchResource = useAsyncResource<Branch[]>(
    () => organizationRepository.listBranches(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadBranches },
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([organizationResource.refetch(), branchResource.refetch()]);
  }, [branchResource, organizationResource]);

  const { saving, saveError, setSaveError, run } = useMutationRunner(refetchAll);

  const updateOrganization = useCallback(
    (input: OrganizationUpdate) =>
      run(
        () => organizationRepository.update(organizationId!, input),
        'The organization could not be updated.',
      ),
    [organizationId, run],
  );

  const createBranch = useCallback(
    (input: BranchInput) =>
      run(
        () => organizationRepository.createBranch(organizationId!, input),
        'The branch could not be created.',
      ),
    [organizationId, run],
  );

  const updateBranch = useCallback(
    (branchId: string, input: Partial<BranchInput>) =>
      run(
        () => organizationRepository.updateBranch(organizationId!, branchId, input),
        'The branch could not be updated.',
      ),
    [organizationId, run],
  );

  const retireBranch = useCallback(
    (branchId: string, reason: string) =>
      run(
        () => organizationRepository.deactivateBranch(organizationId!, branchId, reason),
        'The branch could not be retired.',
      ),
    [organizationId, run],
  );

  return {
    organization: organizationResource.data ?? null,
    branches: useMemo(() => branchResource.data ?? [], [branchResource.data]),

    loading: organizationResource.loading || branchResource.loading,
    error: organizationResource.error ?? branchResource.error,
    organizationForbidden: organizationResource.forbidden || !canReadOrganization,
    branchesForbidden: branchResource.forbidden || !canReadBranches,
    refetch: refetchAll,

    saving,
    saveError,
    dismissError: () => setSaveError(null),
    updateOrganization,
    createBranch,
    updateBranch,
    retireBranch,
    can: { updateOrganization: canUpdateOrganization, writeBranches: canWriteBranches },
  };
}

export type OrganizationState = ReturnType<typeof useOrganization>;
