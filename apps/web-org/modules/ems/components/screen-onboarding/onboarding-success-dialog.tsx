'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle } from '@smarteam/ui';

/**
 * The credentials handover, as a modal.
 *
 * The password exists in exactly one response and is never recoverable — the server keeps a hash
 * — so the one moment it is on screen has to be impossible to walk past. As a panel further down
 * the page it was: the administrator saw "onboarded", closed the dialog, and the only copy of the
 * password went with it.
 *
 * Both fields are here together because both are needed to sign in, and copying them one at a
 * time is where people make mistakes.
 */
export function OnboardingSuccessDialog({
  email,
  name,
  onClose,
  password,
}: {
  email: string | null;
  name: string;
  onClose: () => void;
  password: string | null;
}) {
  const [copied, setCopied] = useState<'both' | 'password' | null>(null);

  const write = async (text: string, mark: 'both' | 'password') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(mark);
    } catch {
      // Refused in plenty of ordinary situations. Both values are on screen and selectable, so
      // there is nothing to recover from — just don't claim it was copied.
      setCopied(null);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogTitle className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success/15 text-sm font-bold text-success"
          >
            ✓
          </span>
          <span className="text-sm font-bold">{name} is onboarded</span>
        </DialogTitle>

        <div className="space-y-4 p-5">
          {password ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Send these to {name}. They sign in at this address with this password, and it keeps
                working until they change it.
              </p>

              <dl className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-baseline gap-3 border-b border-border bg-muted/40 px-3.5 py-2.5">
                  <dt className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Email
                  </dt>
                  <dd className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                    {email}
                  </dd>
                </div>
                <div className="flex items-baseline gap-3 bg-card px-3.5 py-2.5">
                  <dt className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Password
                  </dt>
                  <dd className="min-w-0 flex-1 break-all font-mono text-sm font-semibold text-foreground">
                    {password}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void write(`Email: ${email}\nPassword: ${password}`, 'both')}
                  size="sm"
                  type="button"
                >
                  {copied === 'both' ? 'Copied' : 'Copy email and password'}
                </Button>
                <Button
                  onClick={() => void write(password, 'password')}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {copied === 'password' ? 'Copied' : 'Copy password only'}
                </Button>
              </div>

              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Shown once. Nobody can read this password again — if it is lost it has to be reset,
                so copy it before closing.
              </p>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              The employee record was created. No login was made for them, so they cannot sign in
              yet.
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4">
          <Button onClick={onClose} type="button" variant={password ? 'outline' : 'default'}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
