import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { mtlsFingerprintHeader, type FederationRequest } from './federation.types';
import { FederationAuthService } from './federation-auth.service';

@Injectable()
export class FederationAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: FederationAuthService,
  ) {}

  async canActivate(executionContext: ExecutionContext) {
    const request = executionContext.switchToHttp().getRequest<FederationRequest>();
    const token = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : undefined;
    if (!token) throw new UnauthorizedDomainError('Federation bearer token is required');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; clientId: string; tv: number }>(
        token,
      );
      request.federation = await this.auth.validateAccessToken(payload, this.header(request));
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedDomainError) throw error;
      throw new UnauthorizedDomainError('Federation bearer token is invalid');
    }
  }

  private header(request: Request) {
    const value = request.headers[mtlsFingerprintHeader];
    return Array.isArray(value) ? value[0] : value;
  }
}
