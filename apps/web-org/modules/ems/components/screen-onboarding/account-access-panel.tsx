'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { EmployeeAccessCodeState } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { accessCodeRepository } from '../../repositories/access-code.repository';

/**
 * The second half of onboarding: giving the new employee a way to sign in.
 *
 * Creating an employee record and creating a login are separate acts, and the gap between them is
 * a real state rather than an oversight — plenty of people are on the payroll before they need
 * the software. This panel names where the employee currently stands and offers the one action
 * that moves them forward.
 *
 * The mechanism is a code rather than a password the administrator sets. An administrator who
 * types someone's first password knows a credential that should only ever have been that
 * person's; a code is spent the moment it is used and leaves the employee holding a secret
 * nobody else has ever seen.
 */
export function AccountAccessPanel({ employeeId }: { employeeId: string }) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;

  const [state, setState] = useState<EmployeeAccessCodeState | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      const status = await accessCodeRepository.status(organizationId, employeeId);
      setState(status.state);
      setExpiresAt(status.expiresAt);
    } catch {
      // A status this panel cannot read is not worth an error banner during onboarding: the
      // employee record itself was created, which is what the surrounding card is reporting.
      setState(null);
    }
  }, [employeeId, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const issue = () =>
    run(async () => {
      const issued = await accessCodeRepository.issue(organizationId!, employeeId);
      setCode(issued.code);
      setCopied(false);
      await load();
    }, 'The access code could not be generated.');

  const revoke = () =>
    run(async () => {
      await accessCodeRepository.revoke(organizationId!, employeeId);
      setCode(null);
      await load();
    }, 'The access code could not be revoked.');

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations. The code is on screen and
      // selectable, so there is nothing to recover from — just don't claim it was copied.
      setCopied(false);
    }
  };

  if (state === null) return null;

  return (
    <section className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Account access
          </p>
          <p className="mt-1 text-xs font-semibold text-foreground">{HEADLINE[state]}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {state === 'CODE_ISSUED' && expiresAt
              ? `The code you generated works until ${formatExpiry(expiresAt)}.`
              : DETAIL[state]}
          </p>
        </div>

        {state !== 'ACTIVE' && (
          <div className="flex items-center gap-2">
            {state === 'CODE_ISSUED' && (
              <Button
                disabled={busy}
                onClick={() => void revoke()}
                size="sm"
                type="button"
                variant="ghost"
              >
                Revoke
              </Button>
            )}
            <Button
              disabled={busy}
              onClick={() => void issue()}
              size="sm"
              type="button"
              variant="outline"
            >
              {busy
                ? 'Working…'
                : state === 'CODE_ISSUED'
                  ? 'Generate a new code'
                  : 'Generate access code'}
            </Button>
          </div>
        )}
      </div>

      {code && (
        <div className="mt-3 rounded-md border border-border bg-card px-3 py-2.5">
          <p className="text-[11px] font-bold text-foreground">Employee access code</p>
          <p className="mt-1 font-mono text-lg font-bold tracking-[0.15em] text-foreground">
            {code}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              className="h-auto px-2 py-1 text-[11px]"
              onClick={() => void copy()}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? 'Copied' : 'Copy code'}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Share it with the employee directly. It works once, and only until{' '}
              {expiresAt ? formatExpiry(expiresAt) : 'it expires'}.
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Shown once. Nobody — including you — can read it again afterwards; generating a new one
            replaces it.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11px] font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const HEADLINE: Record<EmployeeAccessCodeState, string> = {
  NO_ACCOUNT: 'No login yet',
  CODE_ISSUED: 'Access code issued',
  CODE_EXPIRED: 'Access code expired',
  ACTIVE: 'Account active',
};

const DETAIL: Record<EmployeeAccessCodeState, string> = {
  NO_ACCOUNT:
    'Generate a code and give it to the employee. They use it to set their own email and password.',
  CODE_ISSUED: 'The employee can use it to activate their account.',
  CODE_EXPIRED: 'It was never used in time. Generate a new one to replace it.',
  ACTIVE: 'This employee can sign in to Smarteam.',
};

/** Local time, since the person reading it is deciding how long they have to pass the code on. */
function formatExpiry(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return 'its expiry';
  return at.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
