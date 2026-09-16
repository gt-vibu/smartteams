'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@smarteam/ui';
import {
  ApiClientError,
  logout,
  platformLogin,
  readSession,
  type AdminSession,
} from '../lib/api-client';
import { LoginScreen } from './auth/login-screen';
import { IntegrationDashboard } from './integration/integration-dashboard';

export function AdminConsole() {
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // The session lives in HttpOnly cookies the browser cannot read, so it is restored by asking
  // the API who we are rather than by reading local storage.
  useEffect(() => {
    let active = true;
    readSession()
      .then((restored) => {
        if (active) setSession(restored);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setMounted(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoginBusy(true);
    setLoginError(null);
    try {
      setSession(await platformLogin(email, password));
    } catch (caught) {
      // No fallback session: a failed sign-in leaves the operator signed out.
      setSession(null);
      setLoginError(describeLoginFailure(caught));
    } finally {
      setLoginBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setSession(null);
    }
  }, []);

  if (!mounted) return <LoadingScreen />;
  if (!session) return <LoginScreen busy={loginBusy} error={loginError} onSubmit={signIn} />;
  return <IntegrationDashboard onLogout={signOut} session={session} />;
}

function describeLoginFailure(caught: unknown): string {
  if (caught instanceof ApiClientError) {
    if (caught.status === 401 || caught.status === 403) {
      return 'Those credentials do not have platform access.';
    }
    if (caught.status === 429) return 'Too many attempts. Wait a moment and try again.';
    return caught.message;
  }
  return caught instanceof Error ? caught.message : 'Unable to sign in.';
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
