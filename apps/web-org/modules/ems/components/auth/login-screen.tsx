'use client';

import { Button, Input, LoadingIndicator } from '@smarteam/ui';
import { Brand } from '@smarteam/ui';
import Image from 'next/image';
import Link from 'next/link';

import React, { useState } from 'react';
import type { OrganizationMembership } from '@smarteam/contracts';

export type LoginAttempt =
  | { status: 'AUTHENTICATED' }
  | { status: 'SELECT_ORGANIZATION'; organizations: OrganizationMembership[] }
  | { status: 'FAILED'; message: string };

interface LoginScreenProps {
  onLogin: (email: string, password: string, organizationId?: string) => Promise<LoginAttempt>;
  /** Sends a new employee to the access-code flow, where they have no credentials to type yet. */
  onActivate: () => void;
  /** Opens "forgot password" with whatever address is already typed. */
  onForgotPassword: (email: string) => void;
  /** An address to start from — the one a password was just set or reset for. */
  initialEmail?: string;
  /** A confirmation to show above the form, such as "Your password was changed". */
  notice?: string;
}

/**
 * Sign-in for the organization workspace.
 *
 * The credentials are verified by the API and nowhere else. The demo-credential panel that
 * previously rendered committed fixture passwords as click-to-fill buttons has been removed:
 * it published working sign-ins for accounts holding the tenant wildcard.
 */
export function LoginScreen({
  onActivate,
  onLogin,
  onForgotPassword,
  initialEmail = '',
  notice,
}: LoginScreenProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>([]);
  const [organizationId, setOrganizationId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError('');
    setIsLoading(true);
    try {
      const result = await onLogin(email.trim(), password, organizationId || undefined);
      if (result.status === 'SELECT_ORGANIZATION') {
        // The server refuses to choose a tenant for a multi-organization account.
        setOrganizations(result.organizations);
        setError('Select which organization to sign in to.');
      } else if (result.status === 'FAILED') {
        setError(result.message);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to authenticate. Please check your network connection.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-login-page min-h-dvh overflow-x-hidden bg-background lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(460px,0.92fr)]">
      <section
        aria-label="Sign in"
        className="flex min-h-[620px] items-center justify-center px-5 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 lg:col-start-2 lg:row-start-1 lg:min-h-dvh lg:px-10 xl:px-16"
      >
        <div className="w-full max-w-[440px]">
          <div className="mb-7 lg:mb-9">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Welcome back
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Sign in to your workspace
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your work email and password.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_rgba(22,38,29,.08)]">
            <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-7" aria-busy={isLoading}>
              {notice && (
                <p
                  className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-xs font-medium text-success-foreground"
                  role="status"
                >
                  {notice}
                </p>
              )}
              {/* Email */}
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Work Email
                </label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="you@smarteam.cloud"
                  required
                  className="w-full bg-input-surface border border-input rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring/60 transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="login-password"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Password
                  </label>
                  <Button
                    className="h-auto px-1 py-0 text-[11px] font-semibold text-primary hover:opacity-80"
                    onClick={() => onForgotPassword(email.trim())}
                    type="button"
                    variant="ghost"
                  >
                    Forgot password?
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    aria-describedby={error ? 'login-error' : undefined}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="••••••••"
                    required
                    className="w-full bg-input-surface border border-input rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring/60 transition-all pr-10"
                  />
                  {/* An affordance inside the field, not an action of its own — so `ghost`, and
                    sized to the icon rather than to a button. */}
                  <Button
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground sm:right-2 sm:h-7 sm:w-7"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-pressed={showPassword}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {showPassword ? (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </Button>
                </div>
              </div>

              {organizations.length > 0 && (
                <div>
                  <label
                    htmlFor="login-organization"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Organization
                  </label>
                  <select
                    id="login-organization"
                    value={organizationId}
                    onChange={(event) => {
                      setOrganizationId(event.target.value);
                      setError('');
                    }}
                    required
                    className="w-full bg-input-surface border border-input rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/60"
                  >
                    <option value="">Select an organization…</option>
                    {organizations.map((organization) => (
                      <option key={organization.organizationId} value={organization.organizationId}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5"
                  role="alert"
                >
                  <svg
                    className="h-4 w-4 text-rose-400 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p id="login-error" className="text-xs text-destructive">
                    {error}
                  </p>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                variant="default"
                disabled={isLoading || !email || !password}
                className="w-full h-11 sm:h-10 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <LoadingIndicator variant="inline" label="Signing in" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </div>

          <div className="mt-5 text-center">
            <p className="text-xs text-muted-foreground">
              Joining your organization for the first time?
            </p>
            <Button
              className="mt-1 text-sm font-semibold text-primary hover:opacity-80"
              onClick={onActivate}
              type="button"
              variant="ghost"
            >
              Activate your employee account
            </Button>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
              <Link
                href="/terms"
                className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Terms &amp; Conditions
              </Link>
              <span aria-hidden="true">·</span>
              <span>Smarteam EMS</span>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label="About Smarteam"
        className="relative flex min-h-[330px] flex-col overflow-hidden bg-[#0d3829] px-6 py-6 text-[#f7f5ec] sm:px-10 lg:col-start-1 lg:row-start-1 lg:min-h-dvh lg:px-14 lg:py-10 xl:px-20"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          aria-hidden="true"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 18% 8%, rgba(104, 180, 136, .34), transparent 42%), linear-gradient(135deg, transparent 65%, rgba(0, 20, 14, .42))',
          }}
        />
        <Link
          href="/"
          className="relative z-10 w-fit rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          aria-label="Smarteam home"
        >
          <Brand compact />
        </Link>

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-3 py-5 sm:flex-row sm:gap-7 lg:flex-col lg:items-start lg:gap-0 lg:py-10">
          <div className="w-full max-w-[270px] shrink-0 sm:max-w-[210px] lg:order-2 lg:mt-5 lg:w-[min(40svh,420px)] lg:max-w-full xl:mt-6">
            <div className="relative aspect-square overflow-hidden rounded-[1.6rem] border border-white/15 bg-[#f2f0e6]/95 p-2 shadow-[0_28px_80px_rgba(0,0,0,.26)] sm:p-3 lg:rounded-[2rem] lg:p-4">
              <Image
                src="/landing/smarteam-workforce.webp"
                alt="A connected Smarteam workspace for people, schedules, approvals, and employee records"
                width={1240}
                height={1240}
                priority
                sizes="(max-width: 640px) 270px, (max-width: 1024px) 210px, (max-width: 1440px) 42vw, 560px"
                className="h-full w-full rounded-[1.15rem] object-cover lg:rounded-[1.45rem]"
              />
            </div>
          </div>
          <div className="max-w-xl text-center sm:text-left lg:order-1 lg:pt-8">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a9d5b9]">
              People · time · pay
            </p>
            <h1 className="font-serif text-3xl leading-[1.05] tracking-[-0.04em] sm:text-4xl lg:text-5xl xl:text-6xl">
              Work feels clearer when everything works together.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/70 sm:mx-0 lg:mt-5 lg:text-base lg:leading-7">
              Keep employee records, everyday routines, and the teams behind them in one calm
              workspace.
            </p>
          </div>
        </div>

        <p className="relative z-10 hidden text-xs text-white/55 lg:block">
          A thoughtful workspace for the people behind the work.
        </p>
      </section>
    </main>
  );
}
