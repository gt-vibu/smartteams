import { Global, Module } from '@nestjs/common';
import { RequestContextMiddleware, RequestContextStore } from './context/request-context';
import { ProblemDetailsFilter } from './http/problem-details.filter';
import { DomainContextFactory } from './context/domain-context.factory';

@Global()
@Module({
  exports: [
    DomainContextFactory,
    ProblemDetailsFilter,
    RequestContextMiddleware,
    RequestContextStore,
  ],
  providers: [
    DomainContextFactory,
    ProblemDetailsFilter,
    RequestContextMiddleware,
    RequestContextStore,
  ],
})
export class CommonModule {}
