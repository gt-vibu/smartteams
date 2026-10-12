'use client';

import type { Organization } from '@smarteam/contracts';
import { LIMITS, textProblem } from '@smarteam/contracts';
import {
  LoadingIndicator,
  Button,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import React, { useEffect, useState } from 'react';
import type { OrganizationState } from '../../hooks/use-organization';
import { useSession } from '../../hooks/auth-context';
import { filesRepository } from '../../repositories/files.repository';
import { TimezoneSelect } from '../common/timezone-select';

/** The currencies offered. Display only for now: amounts are not converted. */
const CURRENCIES = [
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'SAR', label: 'SAR — Saudi Riyal' },
];

/** The saved value stays selectable even when it is not one of the listed ones. */
function withCurrent<T extends { label: string }>(
  options: T[],
  key: (option: T) => string,
  current: string,
  make: (value: string) => T,
) {
  return options.some((option) => key(option) === current) || !current
    ? options
    : [make(current), ...options];
}

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
      <LoadingIndicator variant="panel" label="Loading organization" className="py-10 text-center text-xs text-muted-foreground" />
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
  const { session } = useSession();
  const [name, setName] = useState(organization.name);
  const [timezone, setTimezone] = useState(organization.timezone);
  const [currencyCode, setCurrencyCode] = useState(organization.currencyCode);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);

  const uploadBrandImage = async (kind: 'logo' | 'cover', file?: File) => {
    if (!file || !session?.organizationId) return;
    setImageError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000) {
      setImageError('Choose a JPG, PNG or WebP image up to 8 MB.');
      return;
    }
    setUploading(kind);
    try {
      const ticket = await filesRepository.beginUpload(session.organizationId, {
        purpose: 'ORGANIZATION_BRANDING', originalName: file.name, contentType: file.type, byteSize: file.size,
      });
      await filesRepository.putBytes(ticket.uploadUrl, file);
      const stored = await filesRepository.completeUpload(session.organizationId, ticket.fileId);
      await state.updateOrganization(kind === 'logo' ? { logoFileId: stored.id } : { coverFileId: stored.id });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'The image could not be uploaded.');
    } finally {
      setUploading(null);
    }
  };

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
        <div className="grid gap-3 sm:grid-cols-2">
          <BrandAssetPicker label="Company logo" imageUrl={organization.logoUrl} kind="logo" busy={uploading === 'logo'} disabled={state.saving || !state.can.updateOrganization} onPick={(file) => void uploadBrandImage('logo', file)} />
          <BrandAssetPicker label="Organization banner" imageUrl={organization.coverUrl} kind="cover" busy={uploading === 'cover'} disabled={state.saving || !state.can.updateOrganization} onPick={(file) => void uploadBrandImage('cover', file)} />
        </div>
        {imageError && <p role="alert" className="text-xs text-destructive">{imageError}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label className="mb-1 block" htmlFor="org-name">
              Name
            </Label>
            <Input
              maxLength={LIMITS.title}
              problem={textProblem(name, 'Organization name', LIMITS.title, 2)}
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
            <SelectMenu
              disabled={state.saving || !state.can.updateOrganization}
              onValueChange={setCurrencyCode}
              value={currencyCode}
            >
              <SelectTrigger id="org-currency">
                <SelectValue placeholder="Choose a currency" />
              </SelectTrigger>
              <SelectContent>
                {withCurrent(
                  CURRENCIES,
                  (c) => c.code,
                  currencyCode,
                  (code) => ({
                    code,
                    label: code,
                  }),
                ).map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectMenu>
          </div>
        </div>
        <div>
          <Label className="mb-1 block" htmlFor="org-timezone">
            Timezone
          </Label>
          <div className="sm:max-w-xs">
            <TimezoneSelect
              disabled={state.saving || !state.can.updateOrganization}
              id="org-timezone"
              onChange={setTimezone}
              value={timezone}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Attendance days, automatic check-out and payroll dates follow this timezone.
          </p>
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
        Organization name, timezone, and currency can be updated by an administrator. Identifier,
        status, source, and locale are established during organization setup and remain fixed.
      </p>
    </div>
  );
}

function BrandAssetPicker({
  label, imageUrl, kind, busy, disabled, onPick,
}: {
  label: string; imageUrl?: string | null; kind: 'logo' | 'cover'; busy: boolean; disabled: boolean; onPick: (file?: File) => void;
}) {
  return <label className="block cursor-pointer rounded-lg border border-border p-3 transition hover:border-primary/40">
    <span className="mb-2 block text-xs font-semibold text-foreground">{label}</span>
    <span className={`relative flex overflow-hidden rounded-md bg-muted ${kind === 'logo' ? 'h-20 w-20 items-center justify-center' : 'h-20 w-full items-center justify-center'}`}>
      {imageUrl ? <img src={imageUrl} alt={`${label} preview`} className={`h-full w-full ${kind === 'logo' ? 'object-contain' : 'object-cover'}`} /> : <span className="text-xs text-muted-foreground">No image added</span>}
      {busy && <span className="absolute inset-0 grid place-items-center bg-background/75 text-xs">Uploading…</span>}
    </span>
    <span className="mt-2 block text-xs text-primary">{busy ? 'Uploading' : imageUrl ? 'Change image' : 'Add image'}</span>
    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={(event) => { onPick(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
  </label>;
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
