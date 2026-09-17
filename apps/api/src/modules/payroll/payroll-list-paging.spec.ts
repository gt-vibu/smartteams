import { PayrollAdvancesService } from './payroll-advances.service';
import { encodePayrollCursor } from './payroll-shared';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Advances and payments are read a page at a time on the native routes, and whole for Federation.
 *
 * Both lists only grow — payments by one row per employee per run — and were returned in a single
 * unbounded query. The native routes pass a page; the Federation routes pass none and must keep
 * the bare array their partners were built against.
 */

const ORG = '11111111-1111-4111-8111-111111111111';

const admin: DomainContext = {
  organizationId: ORG,
  accessMode: 'NATIVE',
  actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
  correlationId: 'c',
  requestId: 'r',
  permissions: new Set(['*']),
};

const federation: DomainContext = {
  ...admin,
  accessMode: 'FEDERATION',
  actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
  permissions: new Set([
    'payroll.advances.read',
    'payroll.advances.read.all',
    'payroll.payments.read',
    'payroll.payments.read.all',
  ]),
};

const row = (n: number) => ({ id: `row-${n}` });

function setup(total: number) {
  const rows = Array.from({ length: total }, (_, i) => row(i));
  const findMany = jest.fn((args: { take?: number }) =>
    Promise.resolve(args.take ? rows.slice(0, args.take) : rows),
  );
  const tx = { salaryAdvance: { findMany }, payrollPayment: { findMany: jest.fn(findMany) } };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  return { tx, service: new PayrollAdvancesService(database as never) };
}

type Args = { take?: number; cursor?: { id: string }; skip?: number; orderBy?: unknown };
const argsOf = (mock: jest.Mock) => (mock.mock.calls[0] as [Args])[0];

describe('advance and payment paging', () => {
  it('returns one page and a cursor when more remain', async () => {
    const { tx, service } = setup(150);
    const page = await service.listAdvances(admin, undefined, { limit: 100 });

    expect(argsOf(tx.salaryAdvance.findMany).take).toBe(101);
    expect(page).toMatchObject({ nextCursor: encodePayrollCursor('row-99') });
    expect((page as { items: unknown[] }).items).toHaveLength(100);
  });

  it('has no cursor on the last page', async () => {
    const { service } = setup(3);
    const page = await service.listAdvances(admin, undefined, {});
    expect(page).toEqual({ items: [row(0), row(1), row(2)], nextCursor: undefined });
  });

  it('continues after the cursor, in an order with a tiebreaker', async () => {
    const { tx, service } = setup(3);
    await service.listPayments(admin, undefined, { cursor: encodePayrollCursor('row-7') });

    const args = argsOf(tx.payrollPayment.findMany);
    expect(args.cursor).toEqual({ id: 'row-7' });
    expect(args.skip).toBe(1);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('caps the page at 500 whatever is asked', async () => {
    const { tx, service } = setup(3);
    await service.listPayments(admin, undefined, { limit: 10_000 });
    expect(argsOf(tx.payrollPayment.findMany).take).toBe(501);
  });

  it('refuses a cursor it did not issue', async () => {
    const { service } = setup(3);
    await expect(
      service.listAdvances(admin, undefined, { cursor: 'not-a-cursor' }),
    ).rejects.toThrow('cursor is invalid');
  });

  it.each(['listAdvances', 'listPayments'] as const)(
    'keeps the whole bare array for Federation (%s)',
    async (method) => {
      const { service } = setup(700);
      const result = await service[method](federation);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(700);
    },
  );
});
