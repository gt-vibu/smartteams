'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Icon, Select } from '@smarteam/ui';
import {
  listFederationClientGrants,
  updateFederationClientGrant,
  type FederationClient,
  type FederationGrant,
  type FederationGrantAccess,
} from '../../lib/api-client';

type GrantDialogProps = {
  client: FederationClient | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type ScopeGroup = {
  label: string;
  scopes: string[];
};

export function FederationGrantDialog({ client, onClose, onSaved }: GrantDialogProps) {
  const [access, setAccess] = useState<FederationGrantAccess | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [scopeCodes, setScopeCodes] = useState<string[]>([]);
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOrganization = access?.organizations.find(({ id }) => id === organizationId);
  const selectedGrant = access?.grants.find(({ id }) => id === editingGrantId);
  const scopeGroups = useMemo(() => groupScopes(access?.scopes ?? []), [access?.scopes]);

  useEffect(() => {
    if (!client) return;
    setAccess(null);
    setError(null);
    setLoading(true);
    void listFederationClientGrants(client.id)
      .then((result) => {
        setAccess(result);
        const firstGrant = result.grants.find(({ effect }) => effect === 'ALLOW');
        if (firstGrant) {
          selectGrant(firstGrant);
        } else if (result.organizations[0]) {
          startNewGrant(result.organizations[0].id);
        }
      })
      .catch((caught: unknown) => setError(readableError(caught)))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    if (!client) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, client, onClose]);

  if (!client) return null;

  const deniedGrant = selectedGrant?.effect === 'DENY';
  const hasSelection = organizationId.length > 0;

  function selectGrant(grant: FederationGrant) {
    setEditingGrantId(grant.id);
    setOrganizationId(grant.organizationId);
    setBranchId(grant.branchId ?? '');
    setScopeCodes(grant.scopeCodes);
    setError(null);
  }

  function startNewGrant(nextOrganizationId = organizationId) {
    setEditingGrantId(null);
    setOrganizationId(nextOrganizationId);
    setBranchId('');
    setScopeCodes([]);
    setError(null);
  }

  function toggleScope(code: string) {
    setScopeCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  function selectOrganization(nextOrganizationId: string) {
    setOrganizationId(nextOrganizationId);
    setBranchId('');
    setEditingGrantId(null);
    setScopeCodes([]);
  }

  async function save() {
    if (!client || !organizationId || deniedGrant) return;
    if (scopeCodes.length === 0 && !window.confirm('Revoke this client’s access for this scope?')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateFederationClientGrant(client.id, {
        organizationId,
        ...(branchId ? { branchId } : {}),
        scopeCodes,
      });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/45 p-3 sm:p-6">
      <section
        aria-labelledby="federation-grant-dialog-title"
        aria-modal="true"
        className="flex max-h-[min(900px,calc(100svh-1.5rem))] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:max-h-[calc(100svh-3rem)]"
        role="dialog"
      >
        <div className="flex shrink-0 items-start justify-between gap-5 border-b border-border bg-card px-5 py-5 sm:px-7">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" name="shield" />
              </span>
              <div>
                <h2
                  className="text-xl font-semibold tracking-[-0.03em]"
                  id="federation-grant-dialog-title"
                >
                  Manage access
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{client.name}</p>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Choose a hotel or outlet and select the exact federation scopes this client may use.
            </p>
          </div>
          <Button
            aria-label="Close access dialog"
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="quiet"
          >
            <Icon className="size-5" name="close" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {error && (
            <Alert className="mb-5 border-destructive/25 bg-destructive/5 text-destructive">
              <AlertTitle>Could not update access</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Icon className="size-4 animate-spin" name="refresh" /> Loading grant access…
              </span>
            </div>
          ) : access ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,2fr)]">
              <aside className="rounded-xl border border-border bg-muted/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Current grants</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {access.grants.length} active grant{access.grants.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Button onClick={() => startNewGrant()} type="button" variant="outline">
                    <Icon className="size-4" name="plus" /> Add
                  </Button>
                </div>
                <div className="mt-4 grid gap-2">
                  {access.grants.map((grant) => (
                    <button
                      className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                        editingGrantId === grant.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                      key={grant.id}
                      onClick={() => selectGrant(grant)}
                      type="button"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {grant.organizationName}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {grant.branchName ?? 'All outlets'}
                          </span>
                        </span>
                        <Badge variant={grant.effect === 'ALLOW' ? 'success' : 'destructive'}>
                          {grant.effect}
                        </Badge>
                      </span>
                      <span className="mt-3 block text-xs text-muted-foreground">
                        {grant.scopeCodes.length} scope{grant.scopeCodes.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  ))}
                  {access.grants.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs leading-5 text-muted-foreground">
                      No access grants yet. Add one to authorize this client for a hotel or outlet.
                    </p>
                  )}
                </div>
              </aside>

              <div className="min-w-0 rounded-xl border border-border bg-background p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <h3 className="font-semibold">{editingGrantId ? 'Edit grant' : 'New grant'}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Access is evaluated by client, hotel, outlet, and scope.
                    </p>
                  </div>
                  {hasSelection && !deniedGrant && <Badge>{scopeCodes.length} selected</Badge>}
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">
                    Hotel
                    <Select
                      value={organizationId}
                      onChange={(event) => selectOrganization(event.target.value)}
                    >
                      <option value="">Select a hotel</option>
                      {access.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Outlet
                    <Select
                      disabled={!selectedOrganization || deniedGrant}
                      onChange={(event) => {
                        setBranchId(event.target.value);
                        setEditingGrantId(null);
                        setScopeCodes([]);
                      }}
                      value={branchId}
                    >
                      <option value="">All outlets</option>
                      {selectedOrganization?.branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name} ({branch.code})
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>

                {deniedGrant ? (
                  <Alert className="mt-5 border-warning/25 bg-warning/5 text-warning-foreground">
                    <AlertTitle>Blocked by policy</AlertTitle>
                    <AlertDescription>
                      This deny grant is enforced by policy and cannot be changed from the access
                      editor.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="mt-6 flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
                      <div>
                        <h4 className="font-semibold">Allowed scopes</h4>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Select only the operations this client needs.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          disabled={!hasSelection}
                          onClick={() => setScopeCodes(access.scopes)}
                          type="button"
                          variant="quiet"
                        >
                          Select all
                        </Button>
                        <Button onClick={() => setScopeCodes([])} type="button" variant="quiet">
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {scopeGroups.map((group) => (
                        <div className="rounded-lg border border-border p-4" key={group.label}>
                          <h5 className="text-sm font-semibold">{group.label}</h5>
                          <div className="mt-3 grid gap-2">
                            {group.scopes.map((scope) => (
                              <label
                                className="flex items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                                key={scope}
                              >
                                <input
                                  checked={scopeCodes.includes(scope)}
                                  className="mt-0.5 size-4 accent-primary"
                                  disabled={!hasSelection}
                                  onChange={() => toggleScope(scope)}
                                  type="checkbox"
                                />
                                <span className="min-w-0">
                                  <span className="block font-medium">{scopeLabel(scope)}</span>
                                  <span className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground">
                                    {scope}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <Button disabled={busy} onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={busy || loading || !hasSelection || deniedGrant}
            onClick={() => void save()}
            type="button"
          >
            <Icon className="size-4" name="shield" />
            {busy ? 'Saving…' : scopeCodes.length === 0 ? 'Revoke access' : 'Save access'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function groupScopes(scopes: string[]): ScopeGroup[] {
  const groups = new Map<string, string[]>();
  for (const scope of scopes) {
    const key = scopeGroup(scope);
    groups.set(key, [...(groups.get(key) ?? []), scope]);
  }
  return [...groups.entries()].map(([label, groupScopes]) => ({ label, scopes: groupScopes }));
}

function scopeGroup(scope: string) {
  const prefix = scope.split('.')[0] ?? scope;
  const labels: Record<string, string> = {
    attendance: 'Attendance',
    'approval-policies': 'Approval policies',
    branches: 'Organization setup',
    capabilities: 'Organization setup',
    compliance: 'Compliance',
    employees: 'Employees',
    events: 'Events',
    files: 'Files',
    leave: 'Leave',
    payroll: 'Payroll',
    shifts: 'Shifts',
    tenants: 'Organization setup',
    timesheets: 'Timesheets',
    webhooks: 'Webhooks',
  };
  return labels[prefix] ?? 'Other';
}

function scopeLabel(scope: string) {
  const words = scope
    .split('.')
    .slice(1)
    .join(' ')
    .replaceAll(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return words || scope;
}

function readableError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'The federation grant could not be updated.';
}
