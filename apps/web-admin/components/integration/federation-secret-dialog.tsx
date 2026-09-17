'use client';

import { useState } from 'react';
import { Button, Icon } from '@smarteam/ui';
import type { FederationClientSecret } from '../../lib/api-client';

/**
 * One-time reveal of a newly created or rotated client secret.
 *
 * The warning copy here is deliberately kept: the secret is not retrievable after this dialog
 * closes, so it is an operational instruction rather than decorative description.
 */
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
