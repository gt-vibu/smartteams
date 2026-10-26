'use client';

import React, { useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { passwordRepository } from '../../repositories/password.repository';
import { AuthCard, errorMessage, FormError } from './auth-card';
import { NewPasswordFields, newPasswordProblem } from './new-password-fields';

/**
 * "Forgot password": an email address, then the six-digit code sent to it and a new password.
 *
 * The first step says the same thing whether or not the address has an account — "if it has an
 * account, a code is on its way" — because saying otherwise would tell anyone which addresses
 * belong to whom.
 */
export function ForgotPasswordScreen({
  initialEmail = '',
  onDone,
  onSignIn,
}: {
  initialEmail?: string;
  onDone: (email: string) => void;
  onSignIn: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  const sendCode = async (address: string) => {
    setBusy(true);
    setError('');
    try {
      await passwordRepository.requestResetCode(address);
      setSentTo(address);
    } catch (caught) {
      setError(errorMessage(caught, 'The code could not be sent. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sentTo || busy || code.length !== 6 || newPasswordProblem(password, confirmation)) return;
    setBusy(true);
    setError('');
    try {
      const { email: changed } = await passwordRepository.resetWithCode(sentTo, code, password);
      onDone(changed);
    } catch (caught) {
      setError(errorMessage(caught, 'Your password could not be reset.'));
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

  if (!sentTo)
    return (
      <AuthCard
        description="Enter your work email and we will send you a code to reset your password."
        footer={footer}
        title="Forgot your password?"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) void sendCode(email.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email" className="text-xs font-semibold">
              Work email
            </Label>
            <Input
              autoComplete="email"
              autoFocus
              disabled={busy}
              id="forgot-email"
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && email.trim() && !busy) {
                  event.preventDefault();
                  void sendCode(email.trim());
                }
              }}
              placeholder="you@company.com"
              type="email"
              value={email}
            />
          </div>
          <FormError message={error} />
          <Button className="h-11 w-full sm:h-10" disabled={busy || !email.trim()} type="submit">
            {busy ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      </AuthCard>
    );

  const problem = newPasswordProblem(password, confirmation);
  return (
    <AuthCard
      description={
        <>
          If <span className="font-semibold text-foreground">{sentTo}</span> has an account, a
          six-digit code is on its way. It expires in 10 minutes.
        </>
      }
      footer={footer}
      title="Reset your password"
    >
      <form className="space-y-4" onSubmit={reset}>
        <div className="space-y-1.5">
          <Label htmlFor="reset-code" className="text-xs font-semibold">
            Code from the email
          </Label>
          <Input
            autoComplete="one-time-code"
            autoFocus
            className="font-mono tracking-[0.4em]"
            disabled={busy}
            id="reset-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            value={code}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              className="h-auto px-0 py-0 text-[11px] font-semibold text-primary"
              disabled={busy}
              onClick={() => {
                setResent(true);
                void sendCode(sentTo);
              }}
              type="button"
              variant="ghost"
            >
              Send a new code
            </Button>
            <Button
              className="h-auto px-0 py-0 text-[11px] text-muted-foreground"
              disabled={busy}
              onClick={() => {
                setSentTo(null);
                setCode('');
                setError('');
              }}
              type="button"
              variant="ghost"
            >
              Use a different email
            </Button>
          </div>
          {resent && !error && (
            <p className="text-[11px] text-muted-foreground" role="status">
              A new code is on its way if the last one was more than a minute ago.
            </p>
          )}
        </div>
        <NewPasswordFields
          confirmation={confirmation}
          disabled={busy}
          idPrefix="reset"
          onConfirmationChange={setConfirmation}
          onPasswordChange={setPassword}
          password={password}
        />
        <FormError message={error} />
        <Button
          className="h-11 w-full sm:h-10"
          disabled={busy || code.length !== 6 || Boolean(problem)}
          type="submit"
        >
          {busy ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
    </AuthCard>
  );
}
