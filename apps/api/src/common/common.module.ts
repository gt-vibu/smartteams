import { Global, Module } from '@nestjs/common';
import { RequestContextMiddleware, RequestContextStore } from './context/request-context';
import { ProblemDetailsFilter } from './http/problem-details.filter';
import { PrismaExceptionFilter } from './http/prisma-exception.filter';
import { DomainContextFactory } from './context/domain-context.factory';
import { CsrfMiddleware } from './security/csrf.middleware';
import { SecurityHeadersMiddleware } from './security/security-headers.middleware';

const providers = [
  DomainContextFactory,
  ProblemDetailsFilter,
  PrismaExceptionFilter,
  RequestContextMiddleware,
  RequestContextStore,
  CsrfMiddleware,
  SecurityHeadersMiddleware,
];

@Global()
@Module({
  exports: providers,
  providers,
})
export class CommonModule {}
