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

type InvitationParams = {
  setupToken?: string;
  email?: string;
  tempPassword?: string;
};

/** Reads and removes the invitation parameters from the address bar, so they are not left in history. */
function takeInvitationParams(): InvitationParams | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash || hash.length <= 1) return null;

  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);

  const setupToken = params.get('setup') ?? undefined;
  const email = params.get('email') ?? undefined;
  const tempPassword = params.get('temp') ?? undefined;

  if (!setupToken && !email && !tempPassword) return null;

  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { setupToken, email, tempPassword };
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
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const params = takeInvitationParams();
    if (!params) return;

    if (params.email) setEmail(params.email);
    if (params.tempPassword) {
      setPassword(params.tempPassword);
      setNotice(
        'Your temporary password is pre-filled. Sign in to choose your permanent password.',
      );
      setView('login');
    } else if (params.setupToken) {
      setSetupToken(params.setupToken);
      setView('setup');
    }
  }, []);

  const backToSignIn = (message = '', address = email) => {
    setNotice(message);
    setEmail(address);
    setPassword('');
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
      // Remounted with a new address or password, so the form starts from it rather than a stale value.
      key={`${email}|${password}|${notice}`}
      initialEmail={email}
      initialPassword={password}
      notice={notice}
      onActivate={() => setView('activate')}
      onForgotPassword={(address) => {
        setEmail(address);
        setPassword('');
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
