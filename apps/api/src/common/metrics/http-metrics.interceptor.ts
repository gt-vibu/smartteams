import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Request count, status and latency per route.
 *
 * The label is the route the handler was registered under, not the URL that was requested. That
 * keeps `/v1/organizations/:organizationId/payroll/runs` a single time series instead of one per
 * tenant, and it is the identifier an operator needs anyway when asking which endpoint is failing.
 *
 * Status is recorded as its class — `2xx`, `4xx`, `5xx` — because the question being answered is
 * "are requests failing", and the exact code is already in the structured log for the same request.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const method = request.method;
    const started = process.hrtime.bigint();
    let handlerRecorded = false;
    let responseRecorded = false;

    const route = () => {
      const matched = (request as unknown as { route?: { path?: unknown } }).route?.path;
      return typeof matched === 'string' ? matched : 'unmatched';
    };

    const recordHandler = (status: number) => {
      if (handlerRecorded) return;
      handlerRecorded = true;
      const seconds: number = Number(process.hrtime.bigint() - started) / 1e9;
      const path = route();
      this.metrics.httpRequests.inc({ method, route: path, status: statusClass(status) });
      this.metrics.httpDuration.observe({ method, route: path }, seconds);
    };

    const recordResponse = (aborted: boolean) => {
      if (responseRecorded) return;
      responseRecorded = true;
      const seconds: number = Number(process.hrtime.bigint() - started) / 1e9;
      this.metrics.httpResponseDuration.observe({ method, route: route() }, seconds);
      if (aborted && !handlerRecorded) recordHandler(499);
    };

    // Express emits `finish` only after the body has been serialized and handed to the socket.
    // `close` covers a client that disconnects before that completes.
    response.once('finish', () => recordResponse(false));
    response.once('close', () => {
      if (!response.writableFinished) recordResponse(true);
    });

    return next.handle().pipe(
      tap({
        next: () => recordHandler(response.statusCode),
        error: (error: unknown) =>
          recordHandler(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}

function statusClass(status: number): string {
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}
