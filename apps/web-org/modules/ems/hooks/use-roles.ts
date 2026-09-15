'use client';

import { useMemo } from 'react';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { apiRequest } from '../lib/api-client';
import { orgPath } from '../repositories/api-helpers';
import { useAsyncResource } from './use-async-resource';

export type OrganizationRole = { id: string; code: string; name: string };

/**
 * The organisation's roles, used where a screen has to name one — an approval step's approver,
 * for instance. Read-only: role administration lives outside this module.
 */
export function useRoles() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canRead = hasPermission(permissions, 'rbac.read');

  const resource = useAsyncResource<OrganizationRole[]>(
    async () => {
      const payload = await apiRequest(orgPath(organizationId!, '/roles'), { method: 'GET' });
      const items = Array.isArray(payload)
        ? payload
        : ((payload as { items?: unknown }).items ?? []);
      // The response is unvalidated JSON, so each row is checked before it is trusted.
      return (items as unknown[]).filter(
        (role): role is OrganizationRole =>
          typeof role === 'object' &&
          role !== null &&
          typeof (role as OrganizationRole).id === 'string' &&
          typeof (role as OrganizationRole).name === 'string',
      );
    },
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  return {
    roles: useMemo(() => resource.data ?? [], [resource.data]),
    loading: resource.loading,
    error: resource.error,
    forbidden: resource.forbidden || !canRead,
  };
}
