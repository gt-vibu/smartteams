'use client';

import React, { useState } from 'react';
import type { AccessCodePreview } from '@smarteam/contracts';
import { Button, Input } from '@smarteam/ui';

const FIELD =
  'w-full rounded-lg border border-input bg-input-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';
const LABEL = 'block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5';
const SUBMIT =
  'w-full h-11 sm:h-10 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all shadow-md cursor-pointer';

/** Step one: prove you hold a code, and see who it belongs to before going further. */
export function CodeStep({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.trim()) void onSubmit(code.trim());
      }}
    >
      <div>
        <label className={LABEL} htmlFor="activation-code">
          Access code
        </label>
        <Input
          autoComplete="off"
          autoFocus
          className={`${FIELD} font-mono tracking-[0.2em] uppercase`}
          id="activation-code"
          onChange={(event) => setCode(event.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          spellCheck={false}
          value={code}
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Your administrator gives you this. Dashes and capitals do not matter.
        </p>
      </div>

      {error && <Problem message={error} />}

      <Button className={SUBMIT} disabled={busy || !code.trim()} type="submit" variant="default">
        {busy ? 'Checking…' : 'Continue'}
      </Button>
    </form>
  );
}

/**
 * Step two: choose the credentials.
 *
 * The employee sets both their email and their password here. Nobody else ever knows this
 * password — that is the whole reason this flow exists in place of an administrator handing over
 * one they chose.
 */
export function CredentialsStep({
  busy,
  error,
  onBack,
  onSubmit,
  preview,
}: {
  busy: boolean;
  error: string;
  onBack: () => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  preview: AccessCodePreview;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const tooShort = password.length > 0 && password.length < 12;
  const mismatched = confirm.length > 0 && confirm !== password;
  const ready = email.trim().length > 0 && password.length >= 12 && confirm === password;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) void onSubmit(email.trim(), password);
      }}
    >
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Your organization
        </p>
        <p className="text-sm font-bold text-foreground">{preview.organizationName}</p>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Employee
        </p>
        <p className="text-sm text-foreground">
          {preview.employeeNumber} · {preview.employeeName}
        </p>
      </div>

      <div>
        <label className={LABEL} htmlFor="activation-email">
          Work email
        </label>
        <Input
          autoComplete="email"
          className={FIELD}
          id="activation-email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          type="email"
          value={email}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="activation-password">
          Create password
        </label>
        <Input
          autoComplete="new-password"
          className={FIELD}
          id="activation-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <p
          className={`mt-1.5 text-[11px] ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          At least 12 characters.
        </p>
      </div>

      <div>
        <label className={LABEL} htmlFor="activation-confirm">
          Confirm password
        </label>
        <Input
          autoComplete="new-password"
          className={FIELD}
          id="activation-confirm"
          onChange={(event) => setConfirm(event.target.value)}
          type="password"
          value={confirm}
        />
        {mismatched && <p className="mt-1.5 text-[11px] text-destructive">These do not match.</p>}
      </div>

      {error && <Problem message={error} />}

      <Button className={SUBMIT} disabled={busy || !ready} type="submit" variant="default">
        {busy ? 'Activating…' : 'Activate account'}
      </Button>
      <Button
        className="w-full text-[11px] text-muted-foreground hover:text-foreground"
        onClick={onBack}
        type="button"
        variant="ghost"
      >
        Use a different code
      </Button>
    </form>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}
