'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission } from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { orgPath } from '../repositories/api-helpers';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';

export type PicklistKind = 'project-roles' | 'job-titles' | 'team-roles';
export type PicklistEntry = {
  name: string;
  standard: boolean;
  archived: boolean;
  usage: { total: number; active: number };
};

/** What each list is called on screen, and who may change it (the API checks the same). */
export const PICKLIST_META: Record<
  PicklistKind,
  { label: string; singular: string; writePermission: string }
> = {
  'project-roles': { label: 'Project roles', singular: 'role', writePermission: 'projects.write' },
  'job-titles': { label: 'Job titles', singular: 'title', writePermission: 'employees.write' },
  'team-roles': { label: 'Team roles', singular: 'role', writePermission: 'teams.write' },
};

const path = (organizationId: string, kind: PicklistKind, suffix = '') =>
  orgPath(organizationId, `/picklists/${kind}${suffix}`);

function parseEntries(value: unknown): PicklistEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<PicklistEntry>;
    if (typeof row.name !== 'string') return [];
    return [
      {
        name: row.name,
        standard: Boolean(row.standard),
        archived: Boolean(row.archived),
        usage: {
          total: Number(row.usage?.total ?? 0),
          active: Number(row.usage?.active ?? 0),
        },
      },
    ];
  });
}

/**
 * One of the organization's reference lists (project roles, job titles, team roles): the standard
 * entries and the company's own, with how often each is used. Every change is saved on the server
 * and the list is read again, so what is shown is what is stored.
 */
export function usePicklist(kind: PicklistKind) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const canAdd = hasPermission(permissions, PICKLIST_META[kind].writePermission);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resource = useAsyncResource<PicklistEntry[]>(
    async () => parseEntries(await apiRequest(path(organizationId!, kind), { method: 'GET' })),
    [organizationId, kind],
    { enabled: Boolean(organizationId) },
  );

  const change = useCallback(
    async (suffix: string, body: Record<string, string>): Promise<string | null> => {
      if (!organizationId) return null;
      setSaving(true);
      setError(null);
      try {
        const saved = (await apiRequest(path(organizationId, kind, suffix), {
          method: 'POST',
          body,
        })) as { name?: string } | null;
        await resource.refetch();
        return saved?.name ?? body.name ?? null;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The list could not be changed.');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, kind, resource],
  );

  const entries = useMemo(() => resource.data ?? [], [resource.data]);
  return {
    entries,
    /** What a form may offer for a new record: everything not archived. */
    active: useMemo(() => entries.filter((entry) => !entry.archived), [entries]),
    loading: resource.loading,
    loadError: resource.error,
    canAdd,
    saving,
    error,
    dismissError: () => setError(null),
    /** Resolves to the saved name (an existing entry if it was already there), or null. */
    add: (name: string) => change('', { name }),
    rename: (name: string, to: string) => change('/rename', { name, to }),
    archive: (name: string) => change('/archive', { name }),
    restore: (name: string) => change('/restore', { name }),
    remove: (name: string) => change('/remove', { name }),
  };
}
