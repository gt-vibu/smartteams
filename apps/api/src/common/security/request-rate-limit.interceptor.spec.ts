import { of } from 'rxjs';
import { RequestRateLimitInterceptor } from './request-rate-limit.interceptor';
import { RateLimitError } from '../errors/domain-error';

function harness(limits: Record<string, number> = {}) {
  const counters = new Map<string, number>();
  const client = {
    incr: jest.fn((key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return Promise.resolve(next);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
  };
  const config = {
    get: (key: string, fallback: number) => limits[key] ?? fallback,
  };
  return {
    client,
    counters,
    interceptor: new RequestRateLimitInterceptor({ client } as never, config as never),
  };
}

function call(
  interceptor: RequestRateLimitInterceptor,
  options: { method?: string; url: string; userId?: string; ip?: string },
) {
  const request = {
    method: options.method ?? 'GET',
    originalUrl: options.url,
    ip: options.ip ?? '203.0.113.9',
    user: options.userId ? { userId: options.userId } : undefined,
  };
  const executionContext = {
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return interceptor.intercept(executionContext as never, { handle: () => of('ok') } as never);
}

describe('RequestRateLimitInterceptor', () => {
  it('admits traffic under the ceiling', async () => {
    const { interceptor } = harness();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(
        call(interceptor, { url: '/v1/organizations/o/employees', userId: 'u' }),
      ).resolves.toBeDefined();
    }
  });

  it('refuses a read once the ceiling is passed', async () => {
    const { interceptor } = harness({ RATE_LIMIT_READ_PER_MINUTE: 3 });
    for (let attempt = 0; attempt < 3; attempt += 1)
      await call(interceptor, { url: '/v1/organizations/o/employees', userId: 'u' });

    await expect(
      call(interceptor, { url: '/v1/organizations/o/employees', userId: 'u' }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('holds a whole-tenant computation to the tight tier', async () => {
    // Two ceilings apply here at once; the point is that `calculate` is measured against the
    // expensive one rather than the read one, so a low figure is reachable.
    const { interceptor } = harness({
      RATE_LIMIT_EXPENSIVE_PER_MINUTE: 2,
      RATE_LIMIT_MUTATION_PER_MINUTE: 500,
    });
    const url = '/v1/organizations/o/payroll/runs/r/calculate';
    await call(interceptor, { method: 'POST', url, userId: 'u' });
    await call(interceptor, { method: 'POST', url, userId: 'u' });

    await expect(call(interceptor, { method: 'POST', url, userId: 'u' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('counts each identity separately, so one tenant cannot exhaust another', async () => {
    const { interceptor } = harness({ RATE_LIMIT_READ_PER_MINUTE: 2 });
    const url = '/v1/organizations/o/employees';
    await call(interceptor, { url, userId: 'noisy' });
    await call(interceptor, { url, userId: 'noisy' });
    await expect(call(interceptor, { url, userId: 'noisy' })).rejects.toBeInstanceOf(
      RateLimitError,
    );

    await expect(call(interceptor, { url, userId: 'quiet' })).resolves.toBeDefined();
  });

  it('separates reads from writes so browsing does not consume the write budget', async () => {
    const { interceptor } = harness({
      RATE_LIMIT_READ_PER_MINUTE: 2,
      RATE_LIMIT_MUTATION_PER_MINUTE: 2,
    });
    const url = '/v1/organizations/o/employees';
    await call(interceptor, { url, userId: 'u' });
    await call(interceptor, { url, userId: 'u' });
    await expect(call(interceptor, { url, userId: 'u' })).rejects.toBeInstanceOf(RateLimitError);

    await expect(call(interceptor, { method: 'POST', url, userId: 'u' })).resolves.toBeDefined();
  });

  it('leaves the authentication and federation paths to their own limiters', async () => {
    const { client, interceptor } = harness({ RATE_LIMIT_READ_PER_MINUTE: 1 });
    for (const url of ['/v1/auth/login', '/v1/federation/employees', '/health/ready']) {
      await expect(call(interceptor, { url })).resolves.toBeDefined();
    }
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('fails open when Redis is unavailable', async () => {
    // The opposite of the credential limiter, deliberately: losing the cache must not become a
    // total product outage when RLS and RBAC are still enforcing the boundaries that matter.
    const { interceptor, client } = harness();
    client.incr.mockRejectedValue(new Error('connection refused'));

    await expect(
      call(interceptor, { url: '/v1/organizations/o/employees', userId: 'u' }),
    ).resolves.toBeDefined();
  });

  it('falls back to the source address when there is no session', async () => {
    const { counters, interceptor } = harness();
    await call(interceptor, { url: '/v1/organizations/o/employees', ip: '198.51.100.4' });

    expect([...counters.keys()].some((key) => key.includes('ip:198.51.100.4'))).toBe(true);
  });
});
