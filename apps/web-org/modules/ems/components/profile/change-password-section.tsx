'use client';

import React, { useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { passwordRepository } from '../../repositories/password.repository';
import { errorMessage, FormError } from '../auth/auth-card';
import { NewPasswordFields, newPasswordProblem } from '../auth/new-password-fields';

/**
 * Changing your own password from the profile — for an administrator and an employee alike.
 *
 * Closed until asked for, so the profile form stays the profile form. The current password is
 * required even though the person is signed in. Every other device is signed out; this one stays
 * signed in on the session the response renews.
 */
export function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  const problem = newPasswordProblem(password, confirmation);

  const reset = () => {
    setCurrent('');
    setPassword('');
    setConfirmation('');
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!current || problem || busy) return;
    setBusy(true);
    setError('');
    try {
      await passwordRepository.change(current, password);
      reset();
      setOpen(false);
      setChanged(true);
    } catch (caught) {
      setError(errorMessage(caught, 'Your password could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="change-password-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="change-password-heading" className="text-xs font-bold text-foreground">
            Password
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Changing it signs you out on every other device.
          </p>
        </div>
        {!open && (
          <Button
            onClick={() => {
              setChanged(false);
              setOpen(true);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Change password
          </Button>
        )}
      </div>

      {changed && (
        <p
          className="rounded-md border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success-foreground"
          role="status"
        >
          Password changed. You are still signed in here.
        </p>
      )}

      {open && (
        <form
          className="space-y-3 rounded-lg border border-border bg-muted/20 p-4"
          onSubmit={submit}
        >
          <div className="space-y-1.5">
            <Label htmlFor="profile-current-password" className="text-xs font-semibold">
              Current password
            </Label>
            <Input
              autoComplete="current-password"
              autoFocus
              disabled={busy}
              id="profile-current-password"
              onChange={(event) => setCurrent(event.target.value)}
              type="password"
              value={current}
            />
          </div>
          <NewPasswordFields
            confirmation={confirmation}
            disabled={busy}
            idPrefix="profile-password"
            onConfirmationChange={setConfirmation}
            onPasswordChange={setPassword}
            password={password}
          />
          <FormError message={error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={busy}
              onClick={() => {
                reset();
                setOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={busy || !current || Boolean(problem)} type="submit">
              {busy ? 'Saving…' : 'Update password'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
