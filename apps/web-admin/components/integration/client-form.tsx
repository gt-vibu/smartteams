'use client';

import { useState, type FormEvent } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Icon,
  Input,
} from '@smarteam/ui';
import {
  createFederationClient,
  type AdminSession,
  type FederationClientResult,
} from '../../lib/api-client';
import { FormField } from './form-field';

export function ClientForm({
  session,
  organizationId,
  client,
  onCreated,
}: {
  session: AdminSession;
  organizationId: string;
  client: FederationClientResult | null;
  onCreated: (result: FederationClientResult) => void;
}) {
  const [name, setName] = useState('BlizBooks UAT');
  const [fingerprint, setFingerprint] = useState('');
  const [homeOrganizationId, setHomeOrganizationId] = useState(organizationId);
  const [reason, setReason] = useState('Create the BlizBooks UAT federation client');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSha256Fingerprint(fingerprint)) {
      setError(
        'Enter the BlizBooks SHA-256 certificate fingerprint as 64 hexadecimal characters, with or without colons.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await createFederationClient(session, { name, fingerprint, homeOrganizationId, reason }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The federation client could not be created.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (client) {
    return (
      <div className="grid gap-4">
        <Alert className="border-success/20 bg-success/5 text-success-foreground">
          <AlertTitle className="flex items-center gap-2">
            <Icon className="size-4" name="check" /> Client created
          </AlertTitle>
          <AlertDescription>
            Client ID{' '}
            <code className="rounded bg-success/10 px-1.5 py-0.5">{client.client.clientId}</code> is
            active.
          </AlertDescription>
        </Alert>
        <SecretCard secret={client.credential.clientSecret} />
        <p className="text-xs leading-5 text-muted-foreground">
          The API returns this client secret only during creation. It is not stored in this browser
          session and cannot be recovered here after a refresh.
        </p>
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error && (
        <Alert className="border-destructive/20 bg-destructive/5 text-destructive">
          <AlertTitle>Could not create client</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="client-name" label="Connection name">
          <Input
            id="client-name"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </FormField>
        <FormField
          hint="SHA-256, colon-separated or compact"
          id="client-fingerprint"
          label="BlizBooks mTLS fingerprint"
        >
          <Input
            id="client-fingerprint"
            onChange={(event) => setFingerprint(event.target.value)}
            placeholder="AA:BB:CC:…"
            required
            value={fingerprint}
          />
        </FormField>
        <FormField hint="Internal UUID" id="client-org-id" label="Home organization">
          <Input
            id="client-org-id"
            onChange={(event) => setHomeOrganizationId(event.target.value)}
            required
            value={homeOrganizationId}
          />
        </FormField>
      </div>
      <FormField hint="Required for the audit record" id="client-reason" label="Reason">
        <Input
          id="client-reason"
          minLength={5}
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/35 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" name="lock" />
          </span>
          <span>
            <strong className="font-semibold">mTLS required</strong>
            <span className="block text-xs text-muted-foreground">
              Bearer tokens are bound to this certificate.
            </span>
          </span>
        </div>
        <Icon className="size-4 text-success" name="check" />
      </div>
      <div className="flex justify-end">
        <Button disabled={busy} type="submit">
          {busy ? 'Generating credentials…' : 'Generate client credentials'}{' '}
          {!busy && <Icon className="size-4" name="key" />}
        </Button>
      </div>
    </form>
  );
}

function isSha256Fingerprint(value: string) {
  return /^[a-f0-9]{64}$/i.test(value.replaceAll(':', '').replaceAll(' ', '').trim());
}

function SecretCard({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="border-warning/30 bg-warning/5 shadow-none">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning-foreground">
            <Icon className="size-4" name="warning" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-warning-foreground">Copy this secret now</p>
            <p className="mt-1 text-sm leading-5 text-warning-foreground/80">
              Give it to the BlizBooks integration owner through your approved secure channel. Never
              commit it or paste it into a ticket.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-warning/20 bg-background px-3 py-3 text-xs text-foreground">
            {secret}
          </code>
          <Button className="shrink-0" onClick={copy} type="button" variant="secondary">
            <Icon className="size-4" name={copied ? 'check' : 'clipboard'} />
            {copied ? 'Copied' : 'Copy secret'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
