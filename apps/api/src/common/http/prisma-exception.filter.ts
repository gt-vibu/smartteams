import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ConflictError, NotFoundError } from '../errors/domain-error';
import { ProblemDetailsFilter } from './problem-details.filter';

/**
 * Translates the database's vocabulary into the API's.
 *
 * A `PrismaClientKnownRequestError` is not an `HttpException`, so before this every constraint
 * violation that escaped a service arrived at the generic handler as a 500 reading "An
 * unexpected error occurred" — including the ordinary, expected ones. A duplicate employee
 * number is a 409 the client can act on, and telling it the server broke is both wrong and
 * unactionable.
 *
 * Only the codes with an unambiguous HTTP meaning are mapped. Anything else stays a 500 on
 * purpose: an unrecognised database failure is a server fault, and guessing a 4xx for it would
 * tell the client to fix something it cannot.
 *
 * The message is deliberately generic per code. Prisma's own text names the constraint, the
 * model and sometimes the column, which is schema detail the API does not otherwise expose.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  constructor(private readonly problems: ProblemDetailsFilter) {}

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const translated = translate(exception);
    if (!translated) {
      // Logged here because the generic filter will not see the original.
      this.logger.error(`Unmapped Prisma error ${exception.code}: ${exception.message}`);
      return this.problems.catch(exception, host);
    }
    return this.problems.catch(translated, host);
  }
}

function translate(exception: Prisma.PrismaClientKnownRequestError) {
  switch (exception.code) {
    case 'P2002':
      return new ConflictError('That value is already in use');
    case 'P2003':
      return new ConflictError('A related record is missing or still referenced');
    case 'P2025':
      return new NotFoundError('Record');
    case 'P2034':
      // Two transactions touched the same rows; the caller can simply try again.
      return new ConflictError('The request conflicted with another change. Please try again.');
    default:
      return null;
  }
}
