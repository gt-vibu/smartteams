'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Icon } from '@smarteam/ui';
import {
  deleteFederationClient,
  listFederationClients,
  rotateFederationClientSecret,
  setFederationClientEnabled,
  type AdminSession,
  type FederationClient,
  type FederationClientSecret,
} from '../../lib/api-client';
import { FederationClientDialog, FederationSecretDialog } from './federation-client-dialogs';

export function FederationClients({ session }: { session: AdminSession }) {
  const [clients, setClients] = useState<FederationClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<FederationClient | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<FederationClientSecret | null>(null);

  const load = useCallback(async () => {
    try {
      setClients(await listFederationClients(session));
      setError(null);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setLoading(false);
    }
  }, [session]);

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
      setError(readableError(caught));
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
      setOneTimeSecret(await rotateFederationClientSecret(session, client.id));
    });
  }

  async function toggle(client: FederationClient) {
    const verb = client.isActive ? 'Disable' : 'Enable';
    if (!window.confirm(`${verb} ${client.name}?`)) return;
    await runAction(`toggle:${client.id}`, async () => {
      await setFederationClientEnabled(session, client.id, !client.isActive);
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
    await runAction(`delete:${client.id}`, () => deleteFederationClient(session, client.id));
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

        <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
            <thead className="bg-muted/70 text-xs font-semibold uppercase tracking-[0.045em] text-muted-foreground">
              <tr>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Client ID</th>
                <th className="px-5 py-4">Environment</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Transport</th>
                <th className="px-5 py-4">Created at</th>
                <th className="px-5 py-4">Last used</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((client) => (
                <ClientRow
                  action={action}
                  client={client}
                  key={client.id}
                  onDelete={() => void remove(client)}
                  onEdit={() => setEditingClient(client)}
                  onRotate={() => void rotate(client)}
                  onToggle={() => void toggle(client)}
                />
              ))}
              {!loading && clients.length === 0 && (
                <tr>
                  <td className="px-6 py-14 text-center text-muted-foreground" colSpan={8}>
                    No federation clients yet. Create the BlizBooks connection to begin.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="px-6 py-14 text-center text-muted-foreground" colSpan={8}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="size-4 animate-spin" name="refresh" /> Loading clients…
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
        session={session}
      />
      <FederationSecretDialog onClose={() => setOneTimeSecret(null)} secret={oneTimeSecret} />
    </>
  );
}

function ClientRow({
  client,
  action,
  onEdit,
  onRotate,
  onToggle,
  onDelete,
}: {
  client: FederationClient;
  action: string | null;
  onEdit: () => void;
  onRotate: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const busy = action?.endsWith(client.id) ?? false;
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="px-5 py-5 font-semibold">{client.name}</td>
      <td className="px-5 py-5 font-mono text-xs">{client.clientId}</td>
      <td className="px-5 py-5">{client.environment}</td>
      <td className="px-5 py-5">
        <Badge variant={client.isActive ? 'success' : 'secondary'}>{client.status}</Badge>
      </td>
      <td className="px-5 py-5">
        <span className="inline-flex items-center gap-2 text-sm text-success-foreground">
          <Icon className="size-4 text-success" name="shield" />
          {client.mtlsRequired
            ? `mTLS · ${client.allowedCertificateFingerprints.length} cert`
            : 'OAuth-only UAT'}
        </span>
      </td>
      <td className="px-5 py-5 text-xs text-muted-foreground">{formatDate(client.createdAt)}</td>
      <td className="px-5 py-5 text-xs text-muted-foreground">
        {client.lastUsedAt ? formatDate(client.lastUsedAt) : 'Not tracked'}
      </td>
      <td className="px-5 py-5">
        <div className="flex justify-end gap-2">
          <ActionButton disabled={busy} icon="edit" label="Update certificates" onClick={onEdit} />
          <ActionButton disabled={busy} icon="refresh" label="Rotate secret" onClick={onRotate} />
          <ActionButton
            disabled={busy}
            icon="power"
            label={client.isActive ? 'Disable client' : 'Enable client'}
            onClick={onToggle}
          />
          <ActionButton
            danger
            disabled={busy}
            icon="trash"
            label="Delete client"
            onClick={onDelete}
          />
        </div>
      </td>
    </tr>
  );
}

function ActionButton({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: 'edit' | 'refresh' | 'power' | 'trash';
  label: string;
  danger?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`grid size-10 place-items-center rounded-lg border border-border transition-colors disabled:cursor-wait disabled:opacity-45 ${
        danger
          ? 'text-destructive hover:border-destructive/30 hover:bg-destructive/5'
          : 'hover:bg-muted'
      }`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="size-4" name={icon} />
    </button>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function readableError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'The federation client action could not be completed.';
}
