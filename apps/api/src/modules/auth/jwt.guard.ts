import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RequestContextStore } from '../../common/context/request-context';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

export type NativeRequestUser = { userId: string; sessionId: string; organizationId?: string };

@Injectable()
export class NativeJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly database: TenantDatabaseService,
    private readonly contexts: RequestContextStore,
  ) {}

  async canActivate(executionContext: ExecutionContext) {
    const request = executionContext
      .switchToHttp()
      .getRequest<Request & { user?: NativeRequestUser }>();
    const token = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : undefined;
    if (!token) throw new UnauthorizedDomainError();
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        sid: string;
        tv: number;
        organizationId?: string;
      }>(token);
      const lookup = (tx: Parameters<Parameters<typeof this.database.runSystem>[1]>[0]) =>
        Promise.all([
          tx.user.findUnique({ where: { id: payload.sub } }),
          tx.authSession.findUnique({ where: { id: payload.sid } }),
        ]);
      const [user, session] = payload.organizationId
        ? await this.database.run(
            {
              organizationId: payload.organizationId,
              accessMode: 'NATIVE',
              actor: { type: 'USER', userId: payload.sub },
              correlationId: crypto.randomUUID(),
              requestId: crypto.randomUUID(),
              permissions: new Set(),
            },
            lookup,
          )
        : await this.database.runSystem(undefined, lookup);
      if (
        !user?.isActive ||
        user.tokenVersion !== payload.tv ||
        !session ||
        session.userId !== payload.sub ||
        session.organizationId !== (payload.organizationId ?? null) ||
        session.status !== 'ACTIVE' ||
        session.expiresAt <= new Date()
      )
        throw new UnauthorizedDomainError('Session is invalid or revoked');
      request.user = {
        userId: user.id,
        sessionId: session.id,
        organizationId: payload.organizationId,
      };
      const context = this.contexts.require();
      Object.assign(context, {
        actorType: 'USER',
        userId: user.id,
        organizationId: payload.organizationId,
        accessMode: 'NATIVE',
      });
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedDomainError) throw error;
      throw new UnauthorizedDomainError('Invalid access token');
    }
  }
}
