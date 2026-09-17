'use client';

import React, { useEffect, useState } from 'react';
import { ActivateAccountScreen } from './activate-account-screen';
import { ForgotPasswordScreen } from './forgot-password-screen';
import { LoginScreen, type LoginAttempt } from './login-screen';
import { SetPasswordScreen } from './set-password-screen';

type View = 'login' | 'activate' | 'forgot' | 'setup';

let signInPassword: string | null = null;

/**
 * The password just used to sign in, handed once to the "choose your password" screen.
 *
 * Kept in this module's memory only — never storage, never the URL — so a person who signed in with
 * a temporary password is not asked to type it twice. A reload forgets it.
 */
export function takeSignInPassword(): string | undefined {
  const value = signInPassword ?? undefined;
  signInPassword = null;
  return value;
}

/**
 * Reads the invitation token from the address bar and removes it, so it is not left in history.
 *
 * Only the one-time token travels in the link — never the email or the temporary password. The
 * token expires and works once; a password in a link keeps working until it is changed, and email
 * security scanners routinely record the links they inspect.
 */
function takeSetupToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('setup');
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return token;
}

/**
 * Everything someone sees before they are signed in: sign in, activate with a code, forgot
 * password, and the page an invitation email's button opens.
 */
export function SignedOutScreens({
  onLogin,
}: {
  onLogin: (email: string, password: string, organizationId?: string) => Promise<LoginAttempt>;
}) {
  const [view, setView] = useState<View>('login');
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const token = takeSetupToken();
    if (!token) return;
    setSetupToken(token);
    setView('setup');
  }, []);

  const backToSignIn = (message = '', address = email) => {
    setNotice(message);
    setEmail(address);
    setView('login');
  };

  if (view === 'setup' && setupToken)
    return (
      <SetPasswordScreen
        onDone={(address) => backToSignIn('Your password is set. Sign in with it now.', address)}
        onSignIn={() => backToSignIn()}
        token={setupToken}
      />
    );
  if (view === 'forgot')
    return (
      <ForgotPasswordScreen
        initialEmail={email}
        onDone={(address) =>
          backToSignIn('Your password was reset. Sign in with your new password.', address)
        }
        onSignIn={() => backToSignIn()}
      />
    );
  if (view === 'activate') return <ActivateAccountScreen onSignIn={() => backToSignIn()} />;

  return (
    <LoginScreen
      // Remounted with a new address, so the form starts from it rather than a stale value.
      key={`${email}|${notice}`}
      initialEmail={email}
      notice={notice}
      onActivate={() => setView('activate')}
      onForgotPassword={(address) => {
        setEmail(address);
        setNotice('');
        setView('forgot');
      }}
      onLogin={async (address, pwd, organizationId) => {
        const attempt = await onLogin(address, pwd, organizationId);
        if (attempt.status === 'AUTHENTICATED') signInPassword = pwd;
        return attempt;
      }}
    />
  );
}
