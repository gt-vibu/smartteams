import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProblemDetailsFilter } from './problem-details.filter';

describe('ProblemDetailsFilter', () => {
  it('preserves validation messages from standard Nest exceptions', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const filter = new ProblemDetailsFilter({ get: () => undefined } as never);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }) as unknown as Response,
        getRequest: () => ({ method: 'POST', originalUrl: '/v1/federation/attendance' }) as Request,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new BadRequestException({ message: ['reason must be longer'] }), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'reason must be longer',
        code: 'HTTP_ERROR',
      }),
    );
  });
});
