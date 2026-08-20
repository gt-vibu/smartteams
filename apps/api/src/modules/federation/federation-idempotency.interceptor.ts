import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { FederationIdempotencyService } from './federation-idempotency.service';
import type { FederationRequest } from './federation.types';
import { ConflictError } from '../../common/errors/domain-error';

@Injectable()
export class FederationIdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: FederationIdempotencyService) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = executionContext.switchToHttp().getRequest<FederationRequest>();
    if (!this.shouldApply(request) || !request.federation) return next.handle();
    const idempotencyKey = this.header(request, 'idempotency-key');
    const normalizedKey = idempotencyKey?.trim();
    if (!normalizedKey || normalizedKey.length < 16 || normalizedKey.length > 255)
      throw new ConflictError('Idempotency-Key is required for federation mutations');
    const response = executionContext.switchToHttp().getResponse<Response>();
    const organizationId = this.organization(request);
    const requestFingerprint = {
      method: request.method,
      path: request.path,
      params: request.params,
      query: request.query,
      body: request.body,
    };
    return from(
      this.idempotency.execute(
        request.federation.clientInternalId,
        organizationId,
        normalizedKey,
        requestFingerprint,
        async () => {
          const output = next.handle() as Observable<unknown>;
          const value = await lastValueFrom(output);
          return { status: response.statusCode, body: value, value };
        },
      ),
    );
  }

  private shouldApply(request: FederationRequest) {
    return (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      request.path !== '/v1/oauth/token' &&
      request.path.startsWith('/v1/federation')
    );
  }
  private organization(request: FederationRequest) {
    const parameter = request.params.organizationId;
    if (typeof parameter === 'string') return parameter;
    const body = request.body;
    if (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      'organizationId' in body &&
      typeof body.organizationId === 'string'
    )
      return body.organizationId;
    return this.header(request, 'x-organization-id');
  }
  private header(request: FederationRequest, name: string) {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
