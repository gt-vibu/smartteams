'use client';

import { useMemo } from 'react';
import { hasPermission, type Employee, type Project, type Team } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { workforceRepository } from '../repositories/workforce.repository';
import { useAsyncResource, type ResourceState } from './use-async-resource';

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

export function useEmployees(): ResourceState<Employee[]> & { canRead: boolean } {
  const organizationId = useOrganizationId();
  const { persona } = useSession();
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'employees.read');

  const state = useAsyncResource<Employee[]>(
    () => workforceRepository.listEmployees(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );
  return { ...state, canRead };
}

export function useTeams(): ResourceState<Team[]> & { canRead: boolean } {
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

export function useProjects(): ResourceState<Project[]> & { canRead: boolean } {
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
