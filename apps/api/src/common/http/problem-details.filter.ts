import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../errors/domain-error';
import { RequestContextStore } from '../context/request-context';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly contexts: RequestContextStore) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const context = this.contexts.get();
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : exception,
        `${request.method} ${request.originalUrl}`,
      );
    }
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = problemMessage(body) ?? 'An unexpected error occurred';
    const code =
      problemCode(body) ?? (exception instanceof DomainError ? exception.code : 'HTTP_ERROR');
    const type = `https://api.smarteam.invalid/problems/${status}`;

    response.status(status).json({
      type,
      title: HttpStatus[status] ?? 'Error',
      status,
      detail: message,
      instance: request.originalUrl,
      code,
      meta: {
        requestId: context?.requestId,
        correlationId: context?.correlationId,
      },
    });
  }
}

function problemMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;
  if (typeof value.message === 'string') return value.message;
  if (Array.isArray(value.message)) {
    const messages = value.message.filter(
      (message): message is string => typeof message === 'string',
    );
    return messages.length > 0 ? messages.join('; ') : undefined;
  }
  return undefined;
}

function problemCode(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.code !== 'string') return undefined;
  return value.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
