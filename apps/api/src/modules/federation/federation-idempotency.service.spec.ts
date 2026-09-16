import { idempotencyRequestHash } from './federation-idempotency.service';

describe('federation idempotency fingerprints', () => {
  it('is stable for object key order but changes when the route changes', () => {
    expect(
      idempotencyRequestHash({ method: 'POST', path: '/v1/federation/a', body: { b: 2, a: 1 } }),
    ).toBe(
      idempotencyRequestHash({ body: { a: 1, b: 2 }, path: '/v1/federation/a', method: 'POST' }),
    );
    expect(
      idempotencyRequestHash({ method: 'POST', path: '/v1/federation/a', body: { a: 1 } }),
    ).not.toBe(
      idempotencyRequestHash({ method: 'POST', path: '/v1/federation/b', body: { a: 1 } }),
    );
  });
});
