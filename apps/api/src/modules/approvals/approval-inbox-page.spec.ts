import { approvalInboxPage } from './approval-inbox-page';

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function fixture(count: number, allowed: (number: number) => boolean) {
  const rows = Array.from({ length: count }, (_, number) => ({ id: id(number), number }));
  const fetch = jest.fn((cursor: string | undefined, take: number) => {
    const start = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0;
    return Promise.resolve(rows.slice(start, start + take));
  });
  const actionable = (row: { number: number }) => Promise.resolve(allowed(row.number));
  return { fetch, actionable };
}
describe('Approval inbox visibility', () => {
  it('finds an approver’s requests after 1,000 requests owned by other approvers', async () => {
    const { fetch, actionable } = fixture(1030, (number) => number >= 1000);
    const page = await approvalInboxPage(fetch, actionable, { limit: 50 });
    expect(page.items.map((row) => row.number)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1000),
    );
    expect(page.nextCursor).toBeUndefined();
  });
  it('does not lose or repeat actionable requests across page boundaries', async () => {
    const { fetch, actionable } = fixture(1000, (number) => number % 7 === 0);
    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await approvalInboxPage(fetch, actionable, { limit: 31, cursor });
      seen.push(...page.items.map((row) => row.number));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(Array.from({ length: 143 }, (_, index) => index * 7));
    expect(new Set(seen).size).toBe(seen.length);
  });
  it('keeps federation lists complete beyond the native page size', async () => {
    const { fetch, actionable } = fixture(1001, () => true);
    expect((await approvalInboxPage(fetch, actionable)).items).toHaveLength(1001);
  });
});
