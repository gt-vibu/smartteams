import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

const ONE_YEAR_SECONDS = 31_536_000;

/** Routes that mint or clear session cookies, and so must never be cached. */
const CREDENTIAL_PATH_PREFIX = '/v1/auth';

/**
 * Baseline response security headers.
 *
 * Written directly rather than pulled in via `helmet`, because the API serves JSON only: of
 * helmet's defaults just these apply, and an explicit list is easier to audit than a
 * dependency's changing defaults. A restrictive CSP is included because Swagger is the only
 * HTML this service can serve, and the environment schema forbids it outside development.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly isProductionLike: boolean;
  private readonly swaggerEnabled: boolean;

  constructor(config: ConfigService) {
    const environment = config.get<string>('NODE_ENV', 'development');
    this.isProductionLike = environment === 'production' || environment === 'staging';
    this.swaggerEnabled = config.get<boolean>('SWAGGER_ENABLED', false);
  }

  use(request: Request, response: Response, next: NextFunction) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    response.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    // The API serves JSON, so `default-src 'none'` is correct. The one exception is the
    // Swagger UI page, which the environment schema permits in development only.
    if (!this.swaggerEnabled) {
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
    // Scoped to the credential endpoints, which are the responses that carry Set-Cookie.
    // Applying `no-store` to every route would also change what federation partners are told
    // about caching, and this middleware must stay transparent to that machine-to-machine
    // contract. Every other route is already uncacheable in practice: shared caches do not
    // store responses to requests bearing an Authorization header.
    // `originalUrl`, not `path`: Nest mounts middleware with `app.use`, and Express rewrites
    // `req.path` relative to the mount point, so it is not the route the client asked for.
    if (request.originalUrl.startsWith(CREDENTIAL_PATH_PREFIX)) {
      response.setHeader('Cache-Control', 'no-store');
    }
    if (this.isProductionLike) {
      response.setHeader(
        'Strict-Transport-Security',
        `max-age=${ONE_YEAR_SECONDS}; includeSubDomains`,
      );
    }
    // Express advertises itself by default; suppress the version fingerprint.
    response.removeHeader('X-Powered-By');
    next();
  }
}
