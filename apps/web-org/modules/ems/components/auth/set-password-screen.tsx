'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { passwordRepository } from '../../repositories/password.repository';
import { AuthCard, errorMessage, FormError } from './auth-card';
import { NewPasswordFields, newPasswordProblem } from './new-password-fields';

/**
 * Where an invitation email's button lands: the address the account was made for, and the
 * person's own password.
 *
 * The link carries a one-time token, not the temporary password, so there is nothing to type from
 * the email — the address is shown as it was invited and only the new password is asked for. Once
 * set, the link is spent and the person signs in with it.
 */
export function SetPasswordScreen({
  token,
  onDone,
  onSignIn,
}: {
  token: string;
  onDone: (email: string) => void;
  onSignIn: () => void;
}) {
  const [account, setAccount] = useState<{ email: string; displayName: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    passwordRepository
      .previewSetup(token)
      .then((found) => active && setAccount(found))
      .catch(
        (caught: unknown) =>
          active && setError(errorMessage(caught, 'This link could not be checked.')),
      )
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, [token]);

  const problem = newPasswordProblem(password, confirmation);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    setError('');
    try {
      const { email } = await passwordRepository.completeSetup(token, password);
      onDone(email);
    } catch (caught) {
      setError(errorMessage(caught, 'Your password could not be set.'));
      setBusy(false);
    }
  };

  const footer = (
    <Button
      className="text-[11px] text-muted-foreground hover:text-foreground"
      onClick={onSignIn}
      type="button"
      variant="ghost"
    >
      Back to sign in
    </Button>
  );

  if (checking)
    return (
      <AuthCard title="Set your password" footer={footer}>
        <p className="text-xs text-muted-foreground" role="status">
          Checking your link…
        </p>
      </AuthCard>
    );

  if (!account)
    return (
      <AuthCard title="This link cannot be used" footer={footer}>
        <FormError message={error} />
      </AuthCard>
    );

  return (
    <AuthCard
      description={`Welcome, ${account.displayName}. Choose the password you will sign in with.`}
      footer={footer}
      title="Set your password"
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="setup-email" className="text-xs font-semibold">
            Email
          </Label>
          <Input autoComplete="username" disabled id="setup-email" readOnly value={account.email} />
        </div>
        <NewPasswordFields
          confirmation={confirmation}
          disabled={busy}
          idPrefix="setup"
          onConfirmationChange={setConfirmation}
          onPasswordChange={setPassword}
          password={password}
        />
        <FormError message={error} />
        <Button className="h-11 w-full sm:h-10" disabled={busy || Boolean(problem)} type="submit">
          {busy ? 'Saving…' : 'Set password'}
        </Button>
      </form>
    </AuthCard>
  );
}
