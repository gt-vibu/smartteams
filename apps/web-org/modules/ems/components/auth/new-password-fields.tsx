'use client';

import React, { useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';

/** The server's rule, repeated here only to tell the person before they submit. */
export const PASSWORD_MIN_LENGTH = 12;

export function newPasswordProblem(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password !== confirmation) return 'The two passwords do not match.';
  return null;
}

/**
 * A new password typed twice, with a show/hide toggle and the rule stated as it is met.
 *
 * Shared by every screen that sets a password — the invitation link, the reset code, the required
 * change after a temporary password and the profile — so they all ask the same way.
 */
export function NewPasswordFields({
  idPrefix,
  password,
  confirmation,
  onPasswordChange,
  onConfirmationChange,
  disabled,
}: {
  idPrefix: string;
  password: string;
  confirmation: string;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const longEnough = password.length >= PASSWORD_MIN_LENGTH;
  const mismatch = confirmation.length > 0 && confirmation !== password;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-new`} className="text-xs font-semibold">
            New password
          </Label>
          <Button
            className="h-auto px-1 py-0 text-[11px] font-semibold text-primary"
            disabled={disabled}
            onClick={() => setVisible((current) => !current)}
            type="button"
            variant="ghost"
          >
            {visible ? 'Hide' : 'Show'}
          </Button>
        </div>
        <Input
          autoComplete="new-password"
          disabled={disabled}
          id={`${idPrefix}-new`}
          onChange={(event) => onPasswordChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          value={password}
        />
        <p
          className={`text-[11px] ${
            longEnough
              ? 'text-success-foreground font-medium'
              : password.length > 0
                ? 'text-amber-600 dark:text-amber-400 font-medium'
                : 'text-muted-foreground'
          }`}
        >
          {longEnough
            ? '✓ At least 12 characters.'
            : password.length > 0
              ? `At least 12 characters (${password.length}/${PASSWORD_MIN_LENGTH} characters entered — need ${PASSWORD_MIN_LENGTH - password.length} more)`
              : `At least ${PASSWORD_MIN_LENGTH} characters. A short phrase works well.`}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-confirm`} className="text-xs font-semibold">
          Confirm new password
        </Label>
        <Input
          aria-invalid={mismatch || undefined}
          autoComplete="new-password"
          disabled={disabled}
          id={`${idPrefix}-confirm`}
          onChange={(event) => onConfirmationChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          value={confirmation}
        />
        {mismatch && <p className="text-[11px] text-destructive">The passwords do not match.</p>}
      </div>
    </div>
  );
}
