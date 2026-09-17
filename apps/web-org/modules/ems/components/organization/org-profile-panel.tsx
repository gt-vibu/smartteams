'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import type { Organization } from '@smarteam/contracts';
import type { OrganizationState } from '../../hooks/use-organization';

/**
 * The organization profile.
 *
 * Three fields are editable because three fields are what `PATCH /v1/organizations/:id` accepts.
 * Slug, source, status and locale are shown read-only: they are real backend values, but the
 * tenant does not own them. The screen this replaced offered a cover image, a tagline, an
 * industry and a founding year, none of which exist in the schema.
 */
export function OrgProfilePanel({ organization: state }: { organization: OrganizationState }) {
  const organization = state.organization;

  if (state.organizationForbidden) {
    return <Unavailable detail="You do not have permission to view the organization profile." />;
  }
  if (state.loading) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground" role="status">
        Loading organization...
      </p>
    );
  }
  if (state.error || !organization) {
    return (
      <div
        className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
        role="alert"
      >
        <p className="text-sm font-bold text-foreground">Could not load the organization</p>
        <p className="mt-1 text-xs text-muted-foreground">{state.error ?? 'Nothing returned.'}</p>
        <Button
          className="mt-3"
          onClick={() => void state.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    );
  }

  return <ProfileForm key={organization.version ?? 0} organization={organization} state={state} />;
}

function ProfileForm({
  organization,
  state,
}: {
  organization: Organization;
  state: OrganizationState;
}) {
  const [name, setName] = useState(organization.name);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [currencyCode, setCurrencyCode] = useState(organization.currencyCode);

  useEffect(() => {
    setName(organization.name);
    setTimezone(organization.timezone);
    setCurrencyCode(organization.currencyCode);
  }, [organization]);

  const dirty =
    name !== organization.name ||
    timezone !== organization.timezone ||
    currencyCode !== organization.currencyCode;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || name.trim().length < 2) return;
    await state.updateOrganization({
      name: name.trim(),
      timezone: timezone.trim(),
      currencyCode: currencyCode.trim().toUpperCase(),
    });
  };

  const readOnly = [
    { label: 'Slug', value: organization.slug },
    { label: 'Status', value: organization.status },
    { label: 'Source', value: organization.source },
    { label: 'Locale', value: organization.locale },
  ];

  return (
    <div className="space-y-4">
      <form className="space-y-3 rounded-lg border border-border bg-card p-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label className="mb-1 block" htmlFor="org-name">
              Name
            </Label>
            <Input
              disabled={state.saving || !state.can.updateOrganization}
              id="org-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div>
            <Label className="mb-1 block" htmlFor="org-currency">
              Currency
            </Label>
            <Input
              disabled={state.saving || !state.can.updateOrganization}
              id="org-currency"
              maxLength={3}
              onChange={(event) => setCurrencyCode(event.target.value)}
              value={currencyCode}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 block" htmlFor="org-timezone">
            Timezone
          </Label>
          <Input
            className="sm:max-w-xs"
            disabled={state.saving || !state.can.updateOrganization}
            id="org-timezone"
            onChange={(event) => setTimezone(event.target.value)}
            value={timezone}
          />
        </div>

        {state.saveError && (
          <p className="text-xs text-destructive" role="alert">
            {state.saveError}
          </p>
        )}

        {state.can.updateOrganization && (
          <div className="flex justify-end">
            <Button disabled={state.saving || !dirty} size="sm" type="submit">
              {state.saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        )}
      </form>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {readOnly.map((row) => (
          <div className="bg-card px-4 py-3" key={row.label}>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {row.label}
            </dt>
            <dd className="mt-1 font-mono text-xs text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[11px] text-muted-foreground">
        Name, timezone and currency are the only organization fields the API accepts. Slug, status,
        source and locale are set at onboarding and are not editable here.
      </p>
    </div>
  );
}

export function Unavailable({
  title = 'Not available',
  detail,
}: {
  title?: string;
  detail: string;
}) {
  return (
    <div
      className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
      role="status"
    >
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
