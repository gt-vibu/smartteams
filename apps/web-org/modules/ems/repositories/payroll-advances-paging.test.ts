/**
 * The advances route pages; the repository follows the pages and stops.
 *
 * It used to return every advance in the tenant in one response. Now each response is one page
 * with a `nextCursor`, and the repository reads on until the last page, or a fixed ceiling.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { payrollRepository } from './payroll.repository';

const ORG = '11111111-1111-4111-8111-111111111111';

function advance(n: number) {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`,
    requestedAmount: '5000.00',
    recoveredAmount: '0.00',
    status: 'REQUESTED',
    requestedAt: '2026-09-01T00:00:00.000Z',
  };
}

function mockPages(pages: Array<{ items: unknown[]; nextCursor?: string }>) {
  const spy = vi.fn();
  for (const page of pages)
    spy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { getSetCookie: () => [] },
      json: () => Promise.resolve(page),
    });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe('payrollRepository.listAdvances', () => {
  it('follows the cursor until the last page', async () => {
    const spy = mockPages([
      { items: [advance(1), advance(2)], nextCursor: 'c1' },
      { items: [advance(3)] },
    ]);

    const advances = await payrollRepository.listAdvances(ORG);

    expect(advances.map((a) => a.id.slice(-1))).toEqual(['1', '2', '3']);
    expect(spy).toHaveBeenCalledTimes(2);
    const [secondUrl] = spy.mock.calls[1] as [string];
    expect(secondUrl).toContain('cursor=c1');
    expect(secondUrl).toContain('limit=200');
  });

  it('stops at the ceiling even if the server keeps offering pages', async () => {
    const spy = mockPages(
      Array.from({ length: 30 }, (_, i) => ({ items: [advance(i)], nextCursor: 'again' })),
    );

    await payrollRepository.listAdvances(ORG);

    expect(spy).toHaveBeenCalledTimes(25);
  });
});
