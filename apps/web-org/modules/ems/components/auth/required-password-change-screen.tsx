'use client';

import React, { useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { passwordRepository } from '../../repositories/password.repository';
import { AuthCard, errorMessage, FormError } from './auth-card';
import { NewPasswordFields, newPasswordProblem } from './new-password-fields';

/**
 * Shown straight after signing in with a temporary password someone else issued.
 *
 * Until the person chooses their own, nobody but them and whoever onboarded them should know the
 * password that opens the account — so this comes before the workspace. The temporary password is
 * filled in from the sign-in they just made, held only in memory; after a reload they type it again.
 */
export function RequiredPasswordChangeScreen({
  email,
  temporaryPassword = '',
  onSignOut,
}: {
  email: string;
  temporaryPassword?: string;
  onSignOut: () => void;
}) {
  const [current, setCurrent] = useState(temporaryPassword);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const problem = newPasswordProblem(password, confirmation);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!current || problem || busy) return;
    setBusy(true);
    setError('');
    try {
      await passwordRepository.change(current, password);
      // The response renewed this session. A reload lets every provider read the updated account.
      window.location.assign('/tenant');
    } catch (caught) {
      setError(errorMessage(caught, 'Your password could not be changed.'));
      setBusy(false);
    }
  };

  return (
    <AuthCard
      description="You signed in with a temporary password. Choose your own to continue."
      footer={
        <Button
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onSignOut}
          type="button"
          variant="ghost"
        >
          Sign out
        </Button>
      }
      title="Choose your password"
    >
      <form className="space-y-4" onSubmit={submit}>
        <input autoComplete="username" hidden readOnly type="email" value={email} />
        {!temporaryPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="required-current" className="text-xs font-semibold">
              Temporary password
            </Label>
            <Input
              autoComplete="current-password"
              disabled={busy}
              id="required-current"
              onChange={(event) => setCurrent(event.target.value)}
              type="password"
              value={current}
            />
          </div>
        )}
        <NewPasswordFields
          confirmation={confirmation}
          disabled={busy}
          idPrefix="required"
          onConfirmationChange={setConfirmation}
          onPasswordChange={setPassword}
          password={password}
        />
        <FormError message={error} />
        <Button
          className="h-11 w-full sm:h-10"
          disabled={busy || !current || Boolean(problem)}
          type="submit"
        >
          {busy ? 'Saving…' : 'Save and continue'}
        </Button>
      </form>
    </AuthCard>
  );
}
