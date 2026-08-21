'use client';

import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle, Button, Icon, Input, Label } from '@smarteam/ui';
import { Brand } from '../brand';

interface LoginScreenProps {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function LoginScreen({ busy, error, onSubmit }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(email.trim(), password);
  }

  return (
    <main className="relative flex min-h-svh items-center overflow-hidden px-5 py-8 sm:px-8">
      <div aria-hidden="true" className="admin-grid absolute inset-x-0 top-0 h-[65vh]" />
      <div className="admin-reveal relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-primary/5 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-b from-primary to-primary/95 p-10 text-primary-foreground lg:flex">
          {/* Ambient Glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-1/4 -top-1/4 size-96 rounded-full bg-primary-foreground/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1/4 -right-1/4 size-96 rounded-full bg-primary-foreground/5 blur-3xl"
          />

          <div className="relative z-10 flex h-full flex-col justify-between">
            <Brand compact />
            <div className="max-w-sm">
              <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary-foreground/10 transition-transform duration-300 hover:scale-105">
                <Icon className="size-6" name="shield" />
              </span>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/65">
                Restricted workspace
              </p>
              <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em]">
                Make the connection clear before the first request.
              </h1>
              <p className="mt-5 text-sm leading-6 text-primary-foreground/72">
                Set up the BlizBooks federation boundary, credentials, and least-privilege access
                from one controlled surface.
              </p>
            </div>
            <p className="text-xs text-primary-foreground/55">
              Superadmin access only · Activity is audited
            </p>
          </div>
        </aside>

        <section className="admin-reveal admin-reveal-delay p-6 sm:p-10 lg:p-14">
          <div className="mb-12 lg:hidden">
            <Brand />
          </div>
          <div className="mb-8 max-w-md">
            <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary lg:hidden">
              <Icon className="size-5" name="lock" />
            </div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Secure sign in
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Welcome back.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Use a platform operator account to manage BlizBooks connections. Organization users
              cannot access this workspace.
            </p>
          </div>

          {error && (
            <Alert className="mb-6 border-destructive/20 bg-destructive/5 text-destructive">
              <AlertTitle>Sign in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form className="grid max-w-md gap-5" onSubmit={submit}>
            <div className="grid gap-2">
              <Label htmlFor="email">Platform email</Label>
              <Input
                autoComplete="username"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="operator@example.com"
                required
                type="email"
                value={email}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="password">Password</Label>
                <span className="text-xs text-muted-foreground">Platform identity</span>
              </div>
              <Input
                autoComplete="current-password"
                id="password"
                minLength={1}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </div>
            <Button className="group mt-2 w-full" disabled={busy} type="submit">
              {busy ? 'Verifying access…' : 'Continue to integration desk'}
              {!busy && (
                <Icon
                  className="size-4 transition-transform duration-200 group-hover:translate-x-1"
                  name="arrow-right"
                />
              )}
            </Button>
          </form>

          <div className="mt-9 flex items-start gap-3 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" name="lock" />
            <p>
              Session credentials stay in this browser session and are cleared when you sign out.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
