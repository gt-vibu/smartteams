import { HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';
import { ProblemDetailsFilter } from './problem-details.filter';

/**
 * A malformed id in a path is a request for something that does not exist.
 *
 * `/leave/requests/undefined/decision` reached Postgres, which refuses `"undefined"` for a uuid
 * column with P2007, and nothing mapped that — so every id-bearing route answered garbage input
 * with a 500. Only the uuid case is translated; other P2007s are left as server faults.
 */
function run(error: Prisma.PrismaClientKnownRequestError) {
  const json = jest.fn();
  const status = jest.fn<{ json: jest.Mock }, [number]>().mockReturnValue({ json });
  const problems = new ProblemDetailsFilter({ get: () => undefined } as never);
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }) as unknown as Response,
      getRequest: () =>
        ({
          method: 'POST',
          originalUrl: '/v1/organizations/x/leave/requests/undefined',
        }) as Request,
    }),
  } as unknown as ArgumentsHost;
  new PrismaExceptionFilter(problems).catch(error, host);
  return status.mock.calls[0]?.[0];
}

const prismaError = (code: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'test' });

describe('PrismaExceptionFilter', () => {
  it('answers a non-uuid id with 404, not 500', () => {
    const status = run(
      prismaError('P2007', 'Invalid input value: invalid input syntax for type uuid: "undefined"'),
    );
    expect(status).toBe(HttpStatus.NOT_FOUND);
  });

  it('leaves other data-validation failures as server faults', () => {
    const status = run(prismaError('P2007', 'Invalid input value: value out of range for integer'));
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('still maps a unique violation to a conflict', () => {
    expect(run(prismaError('P2002', 'Unique constraint failed'))).toBe(HttpStatus.CONFLICT);
  });
});
