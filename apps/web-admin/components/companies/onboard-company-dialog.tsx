'use client';

import { useState } from 'react';
import { Button, Icon, Input } from '@smarteam/ui';
import {
  ApiClientError,
  onboardOrganization,
  type OnboardOrganizationResult,
} from '../../lib/api-client';

interface OnboardCompanyDialogProps {
  onClose: () => void;
  onSuccess: (result: OnboardOrganizationResult) => void;
}

export function OnboardCompanyDialog({ onClose, onSuccess }: OnboardCompanyDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    const autoSlug = val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !adminEmail.trim() || !adminDisplayName.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await onboardOrganization({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        timezone: timezone.trim(),
        currencyCode: currencyCode.trim().toUpperCase(),
        adminDisplayName: adminDisplayName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        reason: 'Super Admin company onboarding',
      });
      onSuccess(result);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'Unable to onboard company.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="size-5" name="building" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Onboard New Company</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create a tenant workspace and provision the primary administrator.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            type="button"
          >
            <Icon className="size-5" name="close" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <Icon className="size-4 shrink-0" name="warning" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Details */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/60 pb-1.5">
              1. Company Information
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Company Name <span className="text-destructive">*</span>
                </label>
                <Input
                  disabled={busy}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Acme Technologies"
                  required
                  value={name}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Workspace Slug <span className="text-destructive">*</span>
                </label>
                <Input
                  disabled={busy}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. acme-technologies"
                  required
                  value={slug}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Timezone</label>
                <Input
                  disabled={busy}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="e.g. Asia/Kolkata"
                  value={timezone}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Currency</label>
                <Input
                  disabled={busy}
                  maxLength={3}
                  onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                  placeholder="e.g. INR"
                  value={currencyCode}
                />
              </div>
            </div>
          </div>

          {/* Admin Details */}
          <div className="space-y-3 pt-2">
            <div className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/60 pb-1.5">
              2. Primary Tenant Administrator
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Admin Full Name <span className="text-destructive">*</span>
                </label>
                <Input
                  disabled={busy}
                  onChange={(e) => setAdminDisplayName(e.target.value)}
                  placeholder="e.g. Alex Mercer"
                  required
                  value={adminDisplayName}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Admin Email <span className="text-destructive">*</span>
                </label>
                <Input
                  disabled={busy}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="e.g. admin@acme.com"
                  required
                  type="email"
                  value={adminEmail}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button disabled={busy} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Add Company'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
