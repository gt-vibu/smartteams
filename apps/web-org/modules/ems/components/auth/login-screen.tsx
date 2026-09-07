'use client';

import { Button, Input } from '@smarteam/ui';

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
}

/**
 * Sign-in for the organization workspace.
 *
 * The credentials are verified by the API and nowhere else. The demo-credential panel that
 * previously rendered committed fixture passwords as click-to-fill buttons has been removed:
 * it published working sign-ins for accounts holding the tenant wildcard.
 */
export function LoginScreen({ onActivate, onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
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
    } catch {
      setError('Unable to authenticate. Please check your network connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-secondary/30 blur-3xl" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand Mark */}
        <div className="flex flex-col items-center mb-8 select-none">
          <div className="h-12 w-12 rounded-[10px] bg-primary flex items-center justify-center shadow-lg shadow-sky-500/30 mb-3">
            <svg className="h-6 w-6 fill-white" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Smarteam</h1>
          <p className="text-sm text-muted-foreground mt-1">Employee Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 pt-6 pb-5">
            <h2 className="text-base font-bold text-foreground mb-0.5">
              Sign in to your workspace
            </h2>
            <p className="text-xs text-muted-foreground">Enter your work email and password</p>
          </div>

          {/* Divider */}
          <div className="h-px bg-border mx-6" />

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Work Email
              </label>
              <Input
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
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Input
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
                  className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  size="icon"
                  tabIndex={-1}
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
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                  Organization
                </label>
                <select
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
              <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2.5">
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
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="default"
              disabled={isLoading || !email || !password}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-5 text-center">
          <p className="text-[11px] text-muted-foreground">Don&apos;t have an account yet?</p>
          <Button
            className="mt-0.5 text-xs font-semibold text-primary hover:opacity-80"
            onClick={onActivate}
            type="button"
            variant="ghost"
          >
            Activate your employee account
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">Smarteam EMS · v0.1.0</p>
        </div>
      </div>
    </div>
  );
}
