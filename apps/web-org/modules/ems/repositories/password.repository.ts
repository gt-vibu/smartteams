import { apiRequest } from '../lib/api-client';

/**
 * Choosing, resetting and changing a password.
 *
 * Nothing here returns a password, and nothing puts one in a URL: the invitation link's token
 * travels in the page's fragment and is posted in a request body.
 */
export const passwordRepository = {
  /** Whose invitation link this is, before a password is chosen. */
  async previewSetup(token: string): Promise<{ email: string; displayName: string }> {
    const payload = (await apiRequest('/v1/auth/password/setup/preview', {
      method: 'POST',
      body: { token },
    })) as { email: string; displayName: string };
    return payload;
  },

  /** Spends the link on the person's own password; answers with the address to sign in with. */
  async completeSetup(token: string, password: string): Promise<{ email: string }> {
    return (await apiRequest('/v1/auth/password/setup', {
      method: 'POST',
      body: { token, password },
    })) as { email: string };
  },

  /** Emails a six-digit code. The answer is the same whether or not the address has an account. */
  async requestResetCode(email: string): Promise<void> {
    await apiRequest('/v1/auth/password/forgot', { method: 'POST', body: { email } });
  },

  async resetWithCode(email: string, code: string, password: string): Promise<{ email: string }> {
    return (await apiRequest('/v1/auth/password/reset', {
      method: 'POST',
      body: { email, code, password },
    })) as { email: string };
  },

  /** Changes the signed-in user's password; the response renews this session's cookies. */
  async change(currentPassword: string, newPassword: string): Promise<void> {
    await apiRequest('/v1/auth/password/change', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  },
};
