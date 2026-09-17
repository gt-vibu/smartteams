'use client';

import { useState } from 'react';
import { Button, Icon } from '@smarteam/ui';
import type { OnboardOrganizationResult } from '../../lib/api-client';

interface CredentialConfirmationDialogProps {
  result: OnboardOrganizationResult;
  onClose: () => void;
}

export function CredentialConfirmationDialog({
  result,
  onClose,
}: CredentialConfirmationDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyAll = () => {
    const fullText = `Smarteam Workspace Credentials:
Company: ${result.organization.name}
Slug: ${result.organization.slug}
Admin Name: ${result.adminUser.displayName}
Email: ${result.adminUser.email}
Temporary Password: ${result.temporaryPassword}
Login URL: http://localhost:3000/tenant`;

    copyToClipboard(fullText, 'all');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Icon className="size-6" name="check" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground">Company Onboarded Successfully</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {result.organization.name} has been provisioned with its primary administrator.
            </p>
          </div>
        </div>

        {/* How the administrator gets in: by email first, this screen only as the fallback. */}
        {result.invitation?.queued ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-700 dark:text-emerald-400 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <Icon className="size-4 shrink-0" name="check" />
              <span>Invitation emailed to {result.invitation.emailedTo}</span>
            </div>
            <p className="leading-relaxed">
              It contains their sign-in email, this temporary password and a link to choose their
              own password. Share the details below only if the email does not arrive — the password
              is <strong>never displayed again</strong>.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-600 dark:text-amber-400 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <Icon className="size-4 shrink-0" name="shield" />
              <span>The invitation email could not be sent</span>
            </div>
            <p className="leading-relaxed">
              Copy these credentials and share them securely. The temporary password is hashed and
              will <strong>never be displayed again</strong>; they will be asked to choose their own
              password when they first sign in.
            </p>
          </div>
        )}

        {/* Credential Details Card */}
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3.5">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Company
            </div>
            <div className="text-sm font-bold text-foreground mt-0.5">
              {result.organization.name}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ({result.organization.slug})
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Admin Email
              </div>
              <div className="text-sm font-mono font-medium text-foreground mt-0.5">
                {result.adminUser.email}
              </div>
            </div>
            <Button
              onClick={() => copyToClipboard(result.adminUser.email, 'email')}
              size="sm"
              type="button"
              variant="outline"
              className="h-7 text-xs"
            >
              <Icon className="size-3.5" name="clipboard" />
              {copiedField === 'email' ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Temporary Password
              </div>
              <div className="text-sm font-mono font-bold text-primary mt-0.5 tracking-wide select-all">
                {result.temporaryPassword}
              </div>
            </div>
            <Button
              onClick={() => copyToClipboard(result.temporaryPassword, 'password')}
              size="sm"
              type="button"
              variant="outline"
              className="h-7 text-xs"
            >
              <Icon className="size-3.5" name="clipboard" />
              {copiedField === 'password' ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
          <Button
            onClick={copyAll}
            type="button"
            variant="outline"
            className="w-full sm:w-auto text-xs"
          >
            <Icon className="size-4" name="clipboard" />
            {copiedField === 'all' ? 'All Details Copied!' : 'Copy All Details'}
          </Button>
          <Button onClick={onClose} type="button" className="w-full sm:w-auto text-xs">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
