import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ForbiddenDomainError } from '../errors/domain-error';
import { CsrfMiddleware } from './csrf.middleware';

const CSRF_COOKIE = 'smarteam_session_csrf';
const TOKEN = 'a-csrf-token-value';

function setup(options: { method?: string; cookie?: string; header?: string; auth?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.auth) headers.authorization = options.auth;

  const request = {
    method: options.method ?? 'POST',
    headers,
    get: (name: string) => (name === 'x-csrf-token' ? options.header : undefined),
  } as unknown as Request;

  const config = { get: (_key: string, fallback: string) => fallback } as unknown as ConfigService;
  const next = jest.fn();
  return { next, request, middleware: new CsrfMiddleware(config), response: {} as Response };
}

describe('CsrfMiddleware', () => {
  it('allows a mutation whose header echoes the CSRF cookie', () => {
    const { middleware, request, response, next } = setup({
      cookie: `${CSRF_COOKIE}=${TOKEN}`,
      header: TOKEN,
    });
    middleware.use(request, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks a cookie-authenticated mutation with no CSRF header', () => {
    const { middleware, request, response, next } = setup({ cookie: `${CSRF_COOKIE}=${TOKEN}` });
    expect(() => middleware.use(request, response, next)).toThrow(ForbiddenDomainError);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks a cookie-authenticated mutation whose CSRF header does not match', () => {
    const { middleware, request, response, next } = setup({
      cookie: `${CSRF_COOKIE}=${TOKEN}`,
      header: 'a-different-token',
    });
    expect(() => middleware.use(request, response, next)).toThrow(ForbiddenDomainError);
  });

  it('blocks a mismatch of different length without leaking via a thrown comparison', () => {
    const { middleware, request, response, next } = setup({
      cookie: `${CSRF_COOKIE}=${TOKEN}`,
      header: 'short',
    });
    expect(() => middleware.use(request, response, next)).toThrow(ForbiddenDomainError);
  });

  it('allows safe methods without a CSRF token', () => {
    const { middleware, request, response, next } = setup({
      method: 'GET',
      cookie: `${CSRF_COOKIE}=${TOKEN}`,
    });
    middleware.use(request, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('exempts header-authenticated requests, whose credential is not ambient', () => {
    const { middleware, request, response, next } = setup({ auth: 'Bearer service-token' });
    middleware.use(request, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows unauthenticated mutations such as login, which carry no session cookie', () => {
    const { middleware, request, response, next } = setup({ cookie: 'other=value' });
    middleware.use(request, response, next);
    expect(next).toHaveBeenCalled();
  });
});
