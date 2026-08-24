'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle, Button, Icon, Input, Select } from '@smarteam/ui';
import {
  createFederationClient,
  updateFederationClientCertificates,
  type AdminSession,
  type FederationClient,
  type FederationClientInput,
  type FederationClientSecret,
  type FederationEnvironment,
} from '../../lib/api-client';
import { FormField } from './form-field';

const environments: FederationEnvironment[] = ['SANDBOX', 'STAGING', 'PRODUCTION'];

const emptyForm: FederationClientInput & { fingerprintsText: string } = {
  name: '',
  clientId: '',
  environment: 'SANDBOX',
  isActive: true,
  mtlsRequired: true,
  allowedCertificateFingerprints: [],
  fingerprintsText: '',
};

export function FederationClientDialog({
  session,
  client,
  open,
  onClose,
  onSaved,
}: {
  session: AdminSession;
  client: FederationClient | null;
  open: boolean;
  onClose: () => void;
  onSaved: (secret?: FederationClientSecret) => Promise<void>;
}) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      client
        ? {
            name: client.name,
            clientId: client.clientId,
            environment: client.environment,
            isActive: client.isActive,
            mtlsRequired: client.mtlsRequired,
            allowedCertificateFingerprints: client.allowedCertificateFingerprints,
            fingerprintsText: client.allowedCertificateFingerprints.join('\n'),
          }
        : emptyForm,
    );
  }, [client, open]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose, open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fingerprints = parseFingerprints(form.fingerprintsText);
    if (form.mtlsRequired && fingerprints.length === 0) {
      setError('Enter at least one SHA-256 client certificate fingerprint.');
      return;
    }
    if (fingerprints.some((fingerprint) => !isSha256Fingerprint(fingerprint))) {
      setError('Every certificate fingerprint must contain exactly 64 hexadecimal characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (client) {
        await updateFederationClientCertificates(session, client.id, {
          mtlsRequired: form.mtlsRequired,
          allowedCertificateFingerprints: fingerprints,
        });
        await onSaved();
      } else {
        const secret = await createFederationClient(session, {
          name: form.name.trim(),
          clientId: form.clientId.trim(),
          environment: form.environment,
          isActive: form.isActive,
          mtlsRequired: form.mtlsRequired,
          allowedCertificateFingerprints: fingerprints,
        });
        await onSaved(secret);
      }
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The federation client could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/45 px-4 py-8">
      <section
        aria-labelledby="federation-client-dialog-title"
        aria-modal="true"
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            className="text-2xl font-semibold tracking-[-0.035em]"
            id="federation-client-dialog-title"
          >
            {client ? 'Update certificate settings' : 'Create Federation Client'}
          </h2>
          <Button
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="quiet"
          >
            <Icon className="size-5" name="close" />
          </Button>
        </div>

        <form className="mt-7 grid gap-5" onSubmit={submit}>
          {error && (
            <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
              <AlertTitle>Could not save client</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!client && (
            <>
              <FormField id="client-name" label="Name">
                <Input
                  autoFocus
                  id="client-name"
                  maxLength={120}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                  value={form.name}
                />
              </FormField>
              <FormField id="client-id" label="Client ID">
                <Input
                  autoComplete="off"
                  id="client-id"
                  maxLength={120}
                  minLength={3}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, clientId: event.target.value }))
                  }
                  pattern="[a-zA-Z0-9._:-]+"
                  required
                  value={form.clientId}
                />
              </FormField>
              <FormField id="client-environment" label="Environment">
                <Select
                  id="client-environment"
                  onChange={(event) => {
                    const environment = event.target.value as FederationEnvironment;
                    setForm((current) => ({
                      ...current,
                      environment,
                      mtlsRequired: environment === 'PRODUCTION' ? true : current.mtlsRequired,
                    }));
                  }}
                  value={form.environment}
                >
                  {environments.map((environment) => (
                    <option key={environment} value={environment}>
                      {environment}
                    </option>
                  ))}
                </Select>
              </FormField>
              <CheckField
                checked={form.isActive}
                label="Active"
                onChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
              />
            </>
          )}

          <CheckField
            checked={form.mtlsRequired}
            description="Keep enabled for secure federation. OAuth-only is available only for non-production UAT."
            disabled={form.environment === 'PRODUCTION'}
            label="Require certificate-bound mTLS"
            onChange={(checked) => setForm((current) => ({ ...current, mtlsRequired: checked }))}
          />

          <FormField id="client-fingerprints" label="BlizBooks client certificate fingerprint">
            <textarea
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              id="client-fingerprints"
              onChange={(event) =>
                setForm((current) => ({ ...current, fingerprintsText: event.target.value }))
              }
              placeholder="SHA-256 fingerprint, with or without colons"
              required={form.mtlsRequired}
              value={form.fingerprintsText}
            />
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Paste the SHA-256 fingerprint of the certificate BlizBooks presents to SmarTeam.
              Separate multiple fingerprints with spaces, commas, or new lines.
            </p>
          </FormField>

          <div className="mt-2 flex justify-end gap-3">
            <Button disabled={busy} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              <Icon className="size-4" name={client ? 'shield' : 'key'} />
              {busy ? 'Saving…' : client ? 'Save certificates' : 'Generate Secret'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function FederationSecretDialog({
  secret,
  onClose,
}: {
  secret: FederationClientSecret | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!secret) return null;
  const clientSecret = secret.clientSecret;

  async function copy() {
    await navigator.clipboard.writeText(clientSecret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/45 px-4 py-8">
      <section
        aria-labelledby="federation-secret-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-[-0.035em]" id="federation-secret-title">
            Client Secret
          </h2>
          <Button aria-label="Close secret" onClick={onClose} type="button" variant="quiet">
            <Icon className="size-5" name="close" />
          </Button>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This secret is shown only once. Copy it now and store it in the BlizBooks secret manager.
        </p>
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all text-sm">{clientSecret}</code>
          <Button className="shrink-0" onClick={copy} type="button" variant="outline">
            <Icon className="size-4" name={copied ? 'check' : 'clipboard'} />
            {copied ? 'Copied' : 'Copy Secret'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function CheckField({
  checked,
  label,
  description,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm font-medium">
      <input
        checked={checked}
        className="mt-0.5 size-4 accent-primary"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>
        {label}
        {description && (
          <span className="mt-1 block font-normal leading-5 text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function parseFingerprints(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function isSha256Fingerprint(value: string) {
  return /^[a-f0-9]{64}$/i.test(value.replaceAll(':', ''));
}
