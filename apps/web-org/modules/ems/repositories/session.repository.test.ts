import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';
import { sessionRepository } from './session.repository';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiRequest,
}));

const noWait = () => Promise.resolve();
/** Every call fails with `error`: the session check keeps getting the same answer. */
const alwaysFails = (error: Error) => apiRequest.mockImplementation(() => Promise.reject(error));

describe('sessionRepository.restore', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('reads 401 as signed out, without asking again', async () => {
    alwaysFails(new ApiError('Unauthorized', 401));
    await expect(sessionRepository.restore(noWait)).resolves.toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('asks again after a rate limit instead of signing the person out', async () => {
    apiRequest
      .mockImplementationOnce(() => Promise.reject(new ApiError('Too many requests', 429)))
      .mockImplementationOnce(() => Promise.reject(new ApiError('Unauthorized', 401)));
    await expect(sessionRepository.restore(noWait)).resolves.toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('reports a server that stays down as a failure, never as signed out', async () => {
    alwaysFails(new ApiError('Unavailable', 503));
    await expect(sessionRepository.restore(noWait)).rejects.toThrow('Unavailable');
    expect(apiRequest).toHaveBeenCalledTimes(4);
  });

  it('treats a dropped connection the same way', async () => {
    alwaysFails(new TypeError('Failed to fetch'));
    await expect(sessionRepository.restore(noWait)).rejects.toThrow('Failed to fetch');
  });
});
