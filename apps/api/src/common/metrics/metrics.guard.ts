import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { UnauthorizedDomainError } from '../errors/domain-error';

@Injectable()
export class MetricsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(executionContext: ExecutionContext) {
    const expected = this.config.get<string>('METRICS_TOKEN');
    if (!expected) return true;
    const request = executionContext.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const supplied = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    if (!supplied || !sameSecret(supplied, expected)) throw new UnauthorizedDomainError();
    return true;
  }
}

function sameSecret(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
