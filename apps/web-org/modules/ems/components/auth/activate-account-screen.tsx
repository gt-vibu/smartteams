'use client';

import React, { useState } from 'react';
import type { AccessCodePreview } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { accessCodeRepository } from '../../repositories/access-code.repository';
import { CodeStep, CredentialsStep } from './activation-steps';

/**
 * Employee account activation.
 *
 * Two steps on purpose. The first confirms the code and shows the employee which organization and
 * which record they are about to become — a code typed wrong should be caught before anybody
 * chooses a password, and seeing the right employer named is what tells them this is real. Only
 * then do they set credentials.
 *
 * Nothing here is authenticated: that is the point, since the person using it has no account yet.
 * The code is the only thing that establishes who they are, and the server decides whether it is
 * good — this screen just carries it.
 */
export function ActivateAccountScreen({ onSignIn }: { onSignIn: () => void }) {
  const [preview, setPreview] = useState<AccessCodePreview | null>(null);
  // Held after step one so step two can submit it without asking the employee to retype it.
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const checkCode = async (code: string) => {
    setBusy(true);
    setError('');
    try {
      setPreview(await accessCodeRepository.preview(code));
      setCode(code);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'That code could not be checked. Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const activate = async (email: string, password: string) => {
    setBusy(true);
    setError('');
    try {
      await accessCodeRepository.activate({ code, email, password });
      // The response set the session cookies. A full reload is the honest way in: every provider
      // re-reads the session from the API rather than being patched into an authenticated state.
      window.location.assign('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your account could not be activated.');
      setBusy(false);
    }
  };

  return (
    <div className="h-dvh overflow-y-auto overflow-x-hidden bg-background flex flex-col items-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] relative">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm my-auto">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
          <h1 className="text-lg font-bold text-foreground">
            {preview ? 'Set up your account' : 'Activate your account'}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {preview
              ? 'Choose the email and password you will sign in with.'
              : 'Enter the access code your organization administrator gave you.'}
          </p>

          <div className="mt-5">
            {preview ? (
              <CredentialsStep
                busy={busy}
                error={error}
                onBack={() => {
                  setPreview(null);
                  setError('');
                }}
                onSubmit={activate}
                preview={preview}
              />
            ) : (
              <CodeStep busy={busy} error={error} onSubmit={checkCode} />
            )}
          </div>
        </div>

        <div className="mt-5 text-center">
          <Button
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onSignIn}
            type="button"
            variant="ghost"
          >
            Already have an account? Sign in
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">Smarteam EMS · v0.1.0</p>
        </div>
      </div>
    </div>
  );
}
