'use client';

import { Button, Input } from '@smarteam/ui';

import React, { useState } from 'react';
import credentialsFixture from '../../data/fixtures/credentials.json';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => boolean;
}

type Account = {
  email: string;
  password: string;
  name: string;
  role: string;
  access: string;
  initials: string;
};

const accounts: Account[] = credentialsFixture.accounts;

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setIsLoading(true);

    // Simulate small network delay
    await new Promise((r) => setTimeout(r, 600));

    const success = onLogin(email.trim(), password);
    if (!success) {
      setError('Invalid email or password. Please check the credentials below.');
      setIsLoading(false);
    }
  };

  const handleQuickFill = (account: Account) => {
    setSelectedAccount(account);
    setEmail(account.email);
    setPassword(account.password);
    setError('');
    setShowCredentials(false);
  };

  const accessBadgeClass = (access: string) => {
    if (access.includes('Admin + Employee'))
      return 'bg-violet-500/20 text-violet-300 border-violet-500/40';
    if (access.includes('Admin Only')) return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    if (access.includes('Manager')) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-sky-900/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-indigo-900/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-slate-900/40 blur-3xl" />
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
          <h1 className="text-2xl font-bold text-white tracking-tight">Smarteam</h1>
          <p className="text-sm text-slate-400 mt-1">Employee Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-5">
            <h2 className="text-base font-bold text-white mb-0.5">Sign in to your workspace</h2>
            <p className="text-xs text-slate-400">Use the credentials provided below</p>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-800 mx-6" />

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
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
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60 focus:border-sky-500/60 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60 focus:border-sky-500/60 transition-all pr-10"
                />
                <Button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  tabIndex={-1}
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
                <p className="text-xs text-rose-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 cursor-pointer"
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

        {/* Demo Credentials Panel */}
        <div className="mt-4 bg-[#111827]/80 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm">
          <Button
            type="button"
            onClick={() => setShowCredentials(!showCredentials)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left cursor-pointer hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-slate-300">Demo Credentials</span>
              <span className="text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded">
                {accounts.length} accounts
              </span>
            </div>
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform ${showCredentials ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </Button>

          {showCredentials && (
            <div className="border-t border-slate-800">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto] gap-2 px-5 py-2 bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                <span>Account</span>
                <span>Fill</span>
              </div>

              <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
                {accounts.map((account) => {
                  const isSelected = selectedAccount?.email === account.email;
                  return (
                    <div
                      key={account.email}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        isSelected ? 'bg-sky-900/20' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Avatar */}
                      <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {account.initials}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-white truncate">
                            {account.name}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0 rounded border ${accessBadgeClass(account.access)}`}
                          >
                            {account.access}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                          {account.email}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-500">Password:</span>
                          <code className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0 rounded border border-slate-700 font-mono">
                            {account.password}
                          </code>
                        </div>
                      </div>

                      {/* Quick-fill button */}
                      <Button
                        type="button"
                        onClick={() => handleQuickFill(account)}
                        className="shrink-0 px-2.5 py-1 text-[10px] font-bold rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-all cursor-pointer whitespace-nowrap"
                      >
                        Use →
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-600 mt-5">
          Smarteam EMS · Frontend Simulation · v0.1.0
        </p>
      </div>
    </div>
  );
}
