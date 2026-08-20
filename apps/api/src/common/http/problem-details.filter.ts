import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../errors/domain-error';
import { RequestContextStore } from '../context/request-context';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly contexts: RequestContextStore) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const context = this.contexts.get();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof DomainError ? exception.getResponse() : undefined;
    const message =
      body && typeof body === 'object' && 'message' in body
        ? body.message
        : 'An unexpected error occurred';
    const type = `https://api.smarteam.invalid/problems/${status}`;

    response.status(status).json({
      type,
      title: HttpStatus[status] ?? 'Error',
      status,
      detail: typeof message === 'string' ? message : 'Request failed',
      instance: request.originalUrl,
      code: body && typeof body === 'object' && 'code' in body ? body.code : 'INTERNAL_ERROR',
      meta: {
        requestId: context?.requestId,
        correlationId: context?.correlationId,
      },
    });
  }
}
