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
    const method = request.method;
    const started = process.hrtime.bigint();

    const record = (status: number) => {
      // `route.path` is populated by Express once the handler matched; falling back to the
      // controller path keeps an unmatched request from being labelled with its raw URL.
      // Express types `route` as `any`; read it through `unknown` so the label stays a string.
      const matched = (request as unknown as { route?: { path?: unknown } }).route?.path;
      const route = typeof matched === 'string' ? matched : 'unmatched';
      const seconds: number = Number(process.hrtime.bigint() - started) / 1e9;
      this.metrics.httpRequests.inc({ method, route, status: statusClass(status) });
      this.metrics.httpDuration.observe({ method, route }, seconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(http.getResponse<Response>().statusCode),
        error: (error: unknown) => record(error instanceof HttpException ? error.getStatus() : 500),
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
