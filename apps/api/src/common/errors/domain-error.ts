import { HttpException, HttpStatus } from '@nestjs/common';

export class DomainError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details: Record<string, unknown> = {},
    readonly retryable = false,
  ) {
    super({ code, message, retryable, details }, status);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} was not found`, HttpStatus.NOT_FOUND);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('CONFLICT', message, HttpStatus.CONFLICT, details);
  }
}

export class ForbiddenDomainError extends DomainError {
  constructor(message = 'The operation is not permitted') {
    super('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}

export class UnauthorizedDomainError extends DomainError {
  constructor(message = 'Authentication is required') {
    super('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }
}

export class RateLimitError extends DomainError {
  constructor() {
    super(
      'RATE_LIMITED',
      'The federation client rate limit has been exceeded',
      HttpStatus.TOO_MANY_REQUESTS,
      {},
      true,
    );
  }
}

export class AuthenticationRateLimitError extends DomainError {
  constructor() {
    super(
      'AUTH_RATE_LIMITED',
      'Too many authentication attempts. Please try again later',
      HttpStatus.TOO_MANY_REQUESTS,
      {},
      true,
    );
  }
}

export class StaleWriteError extends ConflictError {
  constructor() {
    super('The record changed before this write completed', { reason: 'STALE_VERSION' });
  }
}
