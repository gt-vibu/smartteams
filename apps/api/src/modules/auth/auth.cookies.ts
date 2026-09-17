import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import {
  CSRF_COOKIE_SUFFIX,
  REFRESH_COOKIE_PATH,
  REFRESH_COOKIE_SUFFIX,
} from '@smarteam/contracts';
import { readCookie } from '../../common/security/cookies';

export type IssuedCookies = { accessToken: string; refreshToken: string; expiresAt: Date };

/**
 * Single source of truth for authentication cookie policy.
 *
 * - the access and refresh cookies are `HttpOnly`, so no XSS payload can read a credential;
 * - the refresh cookie is additionally path-scoped to `/v1/auth`, so it is not attached to
 *   ordinary API traffic and cannot leak through an unrelated handler;
 * - the CSRF cookie is deliberately readable by JavaScript — it is the client half of the
 *   double-submit pair and carries no authority on its own.
 *
 * `SameSite` defaults to `lax`, which is correct both for the deployed topology, where the API
 * and both web apps share a registrable domain (`api.` / `app.` / `admin.`), and for
 * `localhost` in development. A genuinely cross-site deployment must set
 * `SESSION_COOKIE_SAME_SITE=none`, which the environment schema only accepts together with
 * `SESSION_COOKIE_SECURE=true`.
 */
@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService) {}

  get accessCookieName(): string {
    return this.config.get<string>('SESSION_COOKIE_NAME', 'smarteam_session');
  }

  get refreshCookieName(): string {
    return `${this.accessCookieName}${REFRESH_COOKIE_SUFFIX}`;
  }

  get csrfCookieName(): string {
    return `${this.accessCookieName}${CSRF_COOKIE_SUFFIX}`;
  }

  readAccessToken(request: Request): string | undefined {
    return readCookie(request, this.accessCookieName);
  }

  readRefreshToken(request: Request): string | undefined {
    return readCookie(request, this.refreshCookieName);
  }

  readCsrfToken(request: Request): string | undefined {
    return readCookie(request, this.csrfCookieName);
  }

  /** Writes the session cookie pair plus a fresh CSRF token, which is returned to the caller. */
  issue(response: Response, cookies: IssuedCookies): string {
    const csrfToken = randomBytes(32).toString('base64url');
    const accessMaxAge = this.config.get<number>('JWT_ACCESS_TOKEN_TTL_SECONDS', 900) * 1000;

    response.cookie(this.accessCookieName, cookies.accessToken, {
      ...this.baseOptions(),
      httpOnly: true,
      maxAge: accessMaxAge,
    });
    response.cookie(this.refreshCookieName, cookies.refreshToken, {
      ...this.baseOptions(),
      httpOnly: true,
      path: REFRESH_COOKIE_PATH,
      expires: cookies.expiresAt,
    });
    // Mirrors the refresh cookie lifetime so a page loaded after the access token expired can
    // still present a CSRF token for the refresh call.
    response.cookie(this.csrfCookieName, csrfToken, {
      ...this.baseOptions(),
      httpOnly: false,
      expires: cookies.expiresAt,
    });
    return csrfToken;
  }

  clear(response: Response): void {
    response.clearCookie(this.accessCookieName, { ...this.baseOptions(), httpOnly: true });
    response.clearCookie(this.refreshCookieName, {
      ...this.baseOptions(),
      httpOnly: true,
      path: REFRESH_COOKIE_PATH,
    });
    response.clearCookie(this.csrfCookieName, { ...this.baseOptions(), httpOnly: false });
  }

  private baseOptions(): CookieOptions {
    const domain = this.config.get<string>('SESSION_COOKIE_DOMAIN');
    return {
      domain: domain && domain.length > 0 ? domain : undefined,
      path: '/',
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('SESSION_COOKIE_SAME_SITE', 'lax'),
      secure: this.config.get<boolean>('SESSION_COOKIE_SECURE', false),
    };
  }
}
