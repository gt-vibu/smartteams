import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RequestContextStore } from '../../common/context/request-context';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuthCookieService } from './auth.cookies';
import { AuthTokenService } from './auth.tokens';

export type NativeRequestUser = { userId: string; sessionId: string; organizationId?: string };

/**
 * Establishes the authenticated identity for native (browser and first-party) requests.
 *
 * The access token is read from the HttpOnly session cookie first and from an
 * `Authorization: Bearer` header second. The header path is retained for non-browser callers
 * and integration tests; browsers never see a token, so nothing is left for an XSS payload to
 * steal.
 *
 * The token is treated as a claim, not as truth: the user row, the session row and the tenant
 * membership are all re-read on every request, so revocation, deactivation and membership
 * removal take effect immediately rather than at token expiry.
 */
@Injectable()
export class NativeJwtGuard implements CanActivate {
  constructor(
    private readonly tokens: AuthTokenService,
    private readonly cookies: AuthCookieService,
    private readonly database: TenantDatabaseService,
    private readonly contexts: RequestContextStore,
  ) {}

  async canActivate(executionContext: ExecutionContext) {
    const request = executionContext
      .switchToHttp()
      .getRequest<Request & { user?: NativeRequestUser }>();
    const token = this.readToken(request);
    if (!token) throw new UnauthorizedDomainError();

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      const organizationId = payload.organizationId;
      const [user, session, membership] = await this.database.runSystem(
        organizationId,
        async (tx) =>
          Promise.all([
            tx.user.findUnique({
              where: { id: payload.sub },
              select: { id: true, isActive: true, tokenVersion: true },
            }),
            tx.authSession.findUnique({
              where: { id: payload.sid },
              select: {
                id: true,
                userId: true,
                organizationId: true,
                status: true,
                expiresAt: true,
              },
            }),
            organizationId
              ? tx.userOrganization.findFirst({
                  where: { userId: payload.sub, organizationId, status: 'ACTIVE' },
                  select: { id: true },
                })
              : Promise.resolve(null),
          ]),
      );

      if (
        !user?.isActive ||
        user.tokenVersion !== payload.tv ||
        !session ||
        session.userId !== payload.sub ||
        session.organizationId !== (organizationId ?? null) ||
        session.status !== 'ACTIVE' ||
        session.expiresAt <= new Date()
      ) {
        throw new UnauthorizedDomainError('Session is invalid or revoked');
      }
      // A session scoped to a tenant is only valid while the membership behind it is ACTIVE.
      // Without this, a removed member keeps working until their access token expires.
      if (organizationId && !membership) {
        throw new UnauthorizedDomainError('Session is invalid or revoked');
      }

      request.user = { userId: user.id, sessionId: session.id, organizationId };
      Object.assign(this.contexts.require(), {
        actorType: 'USER',
        userId: user.id,
        organizationId,
        accessMode: 'NATIVE',
      });
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedDomainError) throw error;
      throw new UnauthorizedDomainError('Invalid access token');
    }
  }

  private readToken(request: Request): string | undefined {
    const cookie = this.cookies.readAccessToken(request);
    if (cookie) return cookie;
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
