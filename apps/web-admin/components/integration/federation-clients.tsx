'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Icon,
  StandardDataTable,
} from '@smarteam/ui';
import type { ColumnDef } from '@smarteam/ui';

import {
  deleteFederationClient,
  listFederationClients,
  rotateFederationClientSecret,
  setFederationClientEnabled,
  type FederationClient,
  type FederationClientSecret,
} from '../../lib/api-client';
import { FederationClientDialog } from './federation-client-dialogs';
import { ActionButton } from './action-button';
import { formatDateTime, readableError } from '../../lib/format';
import { FederationSecretDialog } from './federation-secret-dialog';

export function FederationClients() {
  const [clients, setClients] = useState<FederationClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<FederationClient | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<FederationClientSecret | null>(null);

  const load = useCallback(async () => {
    try {
      setClients(await listFederationClients());
      setError(null);
    } catch (caught) {
      setError(readableError(caught, 'The federation client action could not be completed.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(key: string, operation: () => Promise<void>) {
    setAction(key);
    setError(null);
    try {
      await operation();
      await load();
    } catch (caught) {
      setError(readableError(caught, 'The federation client action could not be completed.'));
    } finally {
      setAction(null);
    }
  }

  async function rotate(client: FederationClient) {
    if (
      !window.confirm(
        `Rotate the secret for ${client.name}? The existing secret will stop working.`,
      )
    )
      return;
    await runAction(`rotate:${client.id}`, async () => {
      setOneTimeSecret(await rotateFederationClientSecret(client.id));
    });
  }

  async function toggle(client: FederationClient) {
    const verb = client.isActive ? 'Disable' : 'Enable';
    if (!window.confirm(`${verb} ${client.name}?`)) return;
    await runAction(`toggle:${client.id}`, async () => {
      await setFederationClientEnabled(client.id, !client.isActive);
    });
  }

  async function remove(client: FederationClient) {
    if (client.isActive) {
      setError('Disable the federation client before deleting it.');
      return;
    }
    if (
      !window.confirm(`Delete ${client.name}? Its credentials and tenant grants will be revoked.`)
    )
      return;
    await runAction(`delete:${client.id}`, () => deleteFederationClient(client.id));
  }

  return (
    <>
      <section aria-labelledby="federation-clients-title" className="admin-reveal">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1
              className="text-3xl font-semibold tracking-[-0.045em]"
              id="federation-clients-title"
            >
              Federation Clients
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Manage BlizBooks machine clients and their certificate-bound federation access.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} type="button">
            <Icon className="size-4" name="plus" />
            Create Client
          </Button>
        </div>

        {error && (
          <Alert className="mt-6 border-destructive/25 bg-destructive/5 text-destructive">
            <AlertTitle>Federation client action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-8">
          {(() => {
            const columns: ColumnDef<FederationClient>[] = [
              {
                id: 'name',
                header: 'Name',
                accessorKey: 'name',
                sortable: true,
                pinned: 'left',
                cell: (c) => <span className="font-semibold text-slate-900">{c.name}</span>,
              },
              {
                id: 'clientId',
                header: 'Client ID',
                accessorKey: 'clientId',
                sortable: true,
                cell: (c) => <span className="font-mono text-xs text-slate-700">{c.clientId}</span>,
              },
              {
                id: 'environment',
                header: 'Environment',
                accessorKey: 'environment',
                sortable: true,
                filterable: true,
                cell: (c) => <span className="text-slate-700">{c.environment}</span>,
              },
              {
                id: 'status',
                header: 'Status',
                accessorKey: 'status',
                sortable: true,
                filterable: true,
                cell: (c) => (
                  <Badge variant={c.isActive ? 'success' : 'secondary'}>{c.status}</Badge>
                ),
              },
              {
                id: 'transport',
                header: 'Transport',
                sortable: false,
                cell: (c) => (
                  <span className="inline-flex items-center gap-2 text-sm text-emerald-700">
                    <Icon className="size-4 text-emerald-600" name="shield" />
                    {c.mtlsRequired
                      ? `mTLS · ${c.allowedCertificateFingerprints.length} cert`
                      : 'OAuth-only UAT'}
                  </span>
                ),
              },
              {
                id: 'createdAt',
                header: 'Created at',
                accessorKey: 'createdAt',
                sortable: true,
                cell: (c) => (
                  <span className="text-xs text-slate-500">{formatDateTime(c.createdAt)}</span>
                ),
              },
              {
                id: 'lastUsedAt',
                header: 'Last used',
                accessorKey: 'lastUsedAt',
                sortable: true,
                cell: (c) => (
                  <span className="text-xs text-slate-500">
                    {c.lastUsedAt ? formatDateTime(c.lastUsedAt) : 'Not tracked'}
                  </span>
                ),
              },
              {
                id: 'actions',
                header: 'Actions',
                align: 'right',
                pinned: 'right',
                sortable: false,
                cell: (c) => {
                  const busy = action?.endsWith(c.id) ?? false;
                  return (
                    <div className="flex justify-end gap-2">
                      <ActionButton
                        disabled={busy}
                        icon="edit"
                        label="Update certificates"
                        onClick={() => setEditingClient(c)}
                      />
                      <ActionButton
                        disabled={busy}
                        icon="refresh"
                        label="Rotate secret"
                        onClick={() => void rotate(c)}
                      />
                      <ActionButton
                        disabled={busy}
                        icon="power"
                        label={c.isActive ? 'Disable client' : 'Enable client'}
                        onClick={() => void toggle(c)}
                      />
                      <ActionButton
                        danger
                        disabled={busy}
                        icon="trash"
                        label="Delete client"
                        onClick={() => void remove(c)}
                      />
                    </div>
                  );
                },
              },
            ];

            return (
              <StandardDataTable
                data={clients}
                columns={columns}
                keyExtractor={(c) => c.id}
                searchPlaceholder="Search client name, ID, environment..."
                emptyMessage={
                  loading
                    ? 'Loading clients...'
                    : 'No federation clients found. Create the BlizBooks connection to begin.'
                }
                initialRowsPerPage={10}
              />
            );
          })()}
        </div>
      </section>

      <FederationClientDialog
        client={editingClient}
        onClose={() => {
          setCreateOpen(false);
          setEditingClient(null);
        }}
        onSaved={async (secret) => {
          if (secret) setOneTimeSecret(secret);
          await load();
        }}
        open={createOpen || editingClient !== null}
      />
      <FederationSecretDialog onClose={() => setOneTimeSecret(null)} secret={oneTimeSecret} />
    </>
  );
}
