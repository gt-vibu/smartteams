'use client';

import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle, Button, Icon, Input } from '@smarteam/ui';
import {
  createOrganization,
  type AdminSession,
  type OrganizationResult,
} from '../../lib/api-client';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '../../lib/integration';
import { FormField } from './form-field';

export function TenantForm({
  session,
  organization,
  onCreated,
}: {
  session: AdminSession;
  organization: OrganizationResult | null;
  onCreated: (result: OrganizationResult) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [currencyCode, setCurrencyCode] = useState(DEFAULT_CURRENCY);
  const [externalId, setExternalId] = useState('');
  const [reason, setReason] = useState('Initial BlizBooks integration setup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await createOrganization(session, {
          name,
          slug,
          timezone,
          currencyCode: currencyCode.toUpperCase(),
          externalId,
          reason,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The organization could not be created.');
    } finally {
      setBusy(false);
    }
  }

  if (organization) {
    return (
      <Alert className="border-success/20 bg-success/5 text-success-foreground">
        <AlertTitle className="flex items-center gap-2">
          <Icon className="size-4" name="check" /> Tenant is ready
        </AlertTitle>
        <AlertDescription>
          <span className="font-medium">{organization.name}</span> ·{' '}
          <code className="rounded bg-success/10 px-1.5 py-0.5">{organization.id}</code>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error && (
        <Alert className="border-destructive/20 bg-destructive/5 text-destructive">
          <AlertTitle>Could not create tenant</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="tenant-name" label="Organization name">
          <Input
            id="tenant-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="BlizBooks UAT"
            required
            value={name}
          />
        </FormField>
        <FormField hint="URL-safe" id="tenant-slug" label="Slug">
          <Input
            id="tenant-slug"
            onChange={(event) => setSlug(event.target.value)}
            placeholder="blizbooks-uat"
            required
            value={slug}
          />
        </FormField>
        <FormField id="tenant-timezone" label="Timezone">
          <Input
            id="tenant-timezone"
            onChange={(event) => setTimezone(event.target.value)}
            required
            value={timezone}
          />
        </FormField>
        <FormField hint="ISO 4217" id="tenant-currency" label="Currency">
          <Input
            id="tenant-currency"
            maxLength={3}
            onChange={(event) => setCurrencyCode(event.target.value)}
            required
            value={currencyCode}
          />
        </FormField>
        <FormField
          hint="Required for BLIZBOOKS source"
          id="tenant-external-id"
          label="BlizBooks tenant ID"
        >
          <Input
            id="tenant-external-id"
            onChange={(event) => setExternalId(event.target.value)}
            placeholder="bb-tenant-uat"
            required
            value={externalId}
          />
        </FormField>
      </div>
      <FormField hint="Required for the audit record" id="tenant-reason" label="Reason">
        <Input
          id="tenant-reason"
          minLength={10}
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
      <div className="flex justify-end">
        <Button disabled={busy} type="submit">
          {busy ? 'Creating tenant…' : 'Create tenant'}{' '}
          {!busy && <Icon className="size-4" name="arrow-right" />}
        </Button>
      </div>
    </form>
  );
}
