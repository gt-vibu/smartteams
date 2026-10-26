import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export type RequestAccessMode = 'NATIVE' | 'FEDERATION' | 'PLATFORM';
export type RequestActorType = 'USER' | 'FEDERATION_CLIENT' | 'PLATFORM_OPERATOR' | 'SYSTEM';

export type RequestContext = {
  requestId: string;
  correlationId: string;
  accessMode: RequestAccessMode;
  actorType: RequestActorType;
  userId?: string;
  clientId?: string;
  organizationId?: string;
  branchId?: string;
  reason?: string;
};

const correlationHeader = 'x-correlation-id';

@Injectable()
export class RequestContextStore {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  require(): RequestContext {
    const context = this.get();
    if (!context) {
      throw new Error('Request context is not available');
    }
    return context;
  }
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly contexts: RequestContextStore) {}

  use(request: Request, response: Response, next: NextFunction) {
    const candidateCorrelationId = request.header(correlationHeader)?.trim();
    const incomingCorrelationId =
      candidateCorrelationId && /^[\x21-\x7e]{1,128}$/.test(candidateCorrelationId)
        ? candidateCorrelationId
        : undefined;
    const context: RequestContext = {
      requestId: randomUUID(),
      correlationId: incomingCorrelationId || randomUUID(),
      accessMode: 'NATIVE',
      actorType: 'SYSTEM',
    };

    request.headers[correlationHeader] = context.correlationId;
    response.setHeader(correlationHeader, context.correlationId);
    response.setHeader('x-request-id', context.requestId);
    this.contexts.run(context, next);
  }
}
