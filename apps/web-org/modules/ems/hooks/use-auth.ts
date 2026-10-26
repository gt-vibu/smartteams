'use client';

import { useSession, type SessionState } from './auth-context';
import type { AuthSession, Persona } from '../types/auth.types';

/** The session as seen from inside the authenticated workspace, where a persona always exists. */
export type AuthenticatedState = Omit<SessionState, 'persona' | 'session'> & {
  persona: Persona;
  session: AuthSession;
};

/**
 * Session state for workspace screens.
 *
 * The workspace shell renders its screens only after `isAuthenticated`, so `persona` and
 * `session` are guaranteed here and screens do not each have to null-check them. Calling this
 * outside the authenticated subtree is a programming error and throws rather than silently
 * handing back an empty identity that could be mistaken for a real one.
 *
 * Use `useSession()` in the shell itself, where the unauthenticated case is expected.
 */
export function useAuth(): AuthenticatedState {
  const state = useSession();
  if (!state.persona || !state.session) {
    throw new Error('useAuth requires an authenticated session; use useSession in the shell');
  }
  return state as AuthenticatedState;
}
