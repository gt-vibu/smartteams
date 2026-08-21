'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@smarteam/ui';
import {
  ApiClientError,
  clearSession,
  logout,
  platformLogin,
  readSession,
  writeSession,
  type AdminSession,
} from '../lib/api-client';
import { LoginScreen } from './auth/login-screen';
import { IntegrationDashboard } from './integration/integration-dashboard';

export function AdminConsole() {
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    setSession(readSession());
    setMounted(true);
  }, []);

  async function signIn(email: string, password: string) {
    setLoginBusy(true);
    setLoginError(null);
    try {
      const nextSession = await platformLogin(email, password);
      writeSession(nextSession);
      setSession(nextSession);
    } catch (caught) {
      setLoginError(
        caught instanceof ApiClientError && caught.status === 401
          ? 'Those credentials do not have platform access.'
          : caught instanceof Error
            ? caught.message
            : 'Unable to sign in.',
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function signOut() {
    if (!session) return;
    try {
      await logout(session);
    } finally {
      clearSession();
      setSession(null);
    }
  }

  if (!mounted) return <LoadingScreen />;
  if (!session) return <LoginScreen busy={loginBusy} error={loginError} onSubmit={signIn} />;
  return <IntegrationDashboard onLogout={signOut} session={session} />;
}

function LoadingScreen() {
  return (
    <main className="grid min-h-svh place-items-center bg-background">
      <div aria-label="Loading" className="flex items-center gap-3 text-sm text-muted-foreground">
        <Icon className="size-4 animate-spin text-primary" name="refresh" />
        Loading secure workspace…
      </div>
    </main>
  );
}
