import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE_SUFFIX, CSRF_HEADER_NAME } from '@smarteam/contracts';
import { ForbiddenDomainError } from '../errors/domain-error';
import { readCookie } from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF defence for cookie-authenticated requests.
 *
 * Moving the session to a cookie makes it an *ambient* credential, which the browser attaches
 * to cross-site requests automatically. `SameSite=lax` blocks the classic cross-site form POST,
 * but it does not protect against a compromised sibling subdomain, so a second, explicit check
 * is required: an unsafe request authenticated by cookie must echo the CSRF cookie in the
 * `x-csrf-token` header. Script running on an attacker's origin cannot read that cookie, and
 * the Same-Origin Policy prevents it from reading the response even if it guesses.
 *
 * Requests authenticated by `Authorization` header are exempt: a header credential is not
 * ambient, so it cannot be replayed by a cross-site request in the first place. Requests with
 * no session cookie at all are exempt too — there is nothing to ride on.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(request: Request, _response: Response, next: NextFunction) {
    if (SAFE_METHODS.has(request.method)) return next();
    if (request.headers.authorization) return next();

    const cookieName = `${this.config.get<string>('SESSION_COOKIE_NAME', 'smarteam_session')}${CSRF_COOKIE_SUFFIX}`;
    const expected = readCookie(request, cookieName);
    if (!expected) return next();

    const provided = request.get(CSRF_HEADER_NAME);
    if (!provided || !constantTimeEquals(provided, expected)) {
      throw new ForbiddenDomainError('A valid CSRF token is required');
    }
    return next();
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // `timingSafeEqual` throws on a length mismatch, which would itself leak the length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
