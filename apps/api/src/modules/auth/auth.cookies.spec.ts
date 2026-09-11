import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthCookieService } from './auth.cookies';

type SetCookie = { name: string; value: string; options: Record<string, unknown> };

function setup(env: Record<string, unknown> = {}) {
  const config = {
    get: (key: string, fallback?: unknown) => (key in env ? env[key] : fallback),
  } as unknown as ConfigService;
  const written: SetCookie[] = [];
  const cleared: SetCookie[] = [];
  const response = {
    cookie: (name: string, value: string, options: Record<string, unknown>) =>
      written.push({ name, value, options }),
    clearCookie: (name: string, options: Record<string, unknown>) =>
      cleared.push({ name, value: '', options }),
  } as unknown as Response;
  return { written, cleared, response, service: new AuthCookieService(config) };
}

const issued = {
  accessToken: 'access-token-value',
  refreshToken: 'refresh-token-value',
  expiresAt: new Date(Date.now() + 3_600_000),
};

describe('AuthCookieService.issue', () => {
  it('marks both credential cookies HttpOnly so JavaScript cannot read them', () => {
    const { service, response, written } = setup();
    service.issue(response, issued);

    const access = written.find((c) => c.name === 'smarteam_session')!;
    const refresh = written.find((c) => c.name === 'smarteam_session_refresh')!;
    expect(access.options.httpOnly).toBe(true);
    expect(refresh.options.httpOnly).toBe(true);
  });

  it('scopes the refresh cookie to the auth path so it is not sent with ordinary traffic', () => {
    const { service, response, written } = setup();
    service.issue(response, issued);

    expect(written.find((c) => c.name === 'smarteam_session_refresh')!.options.path).toBe(
      '/v1/auth',
    );
    expect(written.find((c) => c.name === 'smarteam_session')!.options.path).toBe('/');
  });

  it('leaves the CSRF cookie readable, as the client half of the double-submit pair', () => {
    const { service, response, written } = setup();
    const token = service.issue(response, issued);

    const csrf = written.find((c) => c.name === 'smarteam_session_csrf')!;
    expect(csrf.options.httpOnly).toBe(false);
    expect(csrf.value).toBe(token);
  });

  it('returns a fresh, high-entropy CSRF token per session', () => {
    const { service, response } = setup();
    const first = service.issue(response, issued);
    const second = service.issue(response, issued);

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
  });

  it('applies Secure and SameSite from configuration', () => {
    const { service, response, written } = setup({
      SESSION_COOKIE_SECURE: true,
      SESSION_COOKIE_SAME_SITE: 'strict',
      SESSION_COOKIE_DOMAIN: 'smarteam.example',
    });
    service.issue(response, issued);

    for (const cookie of written) {
      expect(cookie.options.secure).toBe(true);
      expect(cookie.options.sameSite).toBe('strict');
      expect(cookie.options.domain).toBe('smarteam.example');
    }
  });

  it('never sets a token cookie whose value is empty', () => {
    const { service, response, written } = setup();
    service.issue(response, issued);
    expect(written.every((cookie) => cookie.value.length > 0)).toBe(true);
  });
});

describe('AuthCookieService reading and clearing', () => {
  const requestWith = (cookie: string) => ({ headers: { cookie } }) as unknown as Request;

  it('reads each cookie by exact name', () => {
    const { service } = setup();
    const request = requestWith(
      'smarteam_session=access; smarteam_session_refresh=refresh; smarteam_session_csrf=csrf',
    );
    expect(service.readAccessToken(request)).toBe('access');
    expect(service.readRefreshToken(request)).toBe('refresh');
    expect(service.readCsrfToken(request)).toBe('csrf');
  });

  it('does not confuse a prefixed cookie name with the session cookie', () => {
    const { service } = setup();
    expect(service.readAccessToken(requestWith('not_smarteam_session=attacker'))).toBeUndefined();
  });

  it('returns undefined when no cookie header is present', () => {
    const { service } = setup();
    expect(service.readAccessToken({ headers: {} } as unknown as Request)).toBeUndefined();
  });

  it('clears all three cookies on logout, matching the refresh path', () => {
    const { service, response, cleared } = setup();
    service.clear(response);

    expect(cleared.map((c) => c.name).sort()).toEqual([
      'smarteam_session',
      'smarteam_session_csrf',
      'smarteam_session_refresh',
    ]);
    expect(cleared.find((c) => c.name === 'smarteam_session_refresh')!.options.path).toBe(
      '/v1/auth',
    );
  });
});
