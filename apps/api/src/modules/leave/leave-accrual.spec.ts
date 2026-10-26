import { Prisma } from '../../generated/prisma/client';
import { entitlement, reconcileBalance, type AccrualLeaveType } from './leave-accrual';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const year = { periodStart: d('2026-01-01'), periodEnd: d('2026-12-31') };
const type = (overrides: Partial<AccrualLeaveType> = {}): AccrualLeaveType => ({
  accrualType: 'FIXED_ANNUAL',
  annualAllowance: new Prisma.Decimal(12),
  monthlyAccrual: null,
  carryoverLimit: null,
  prorateForJoiners: true,
  ...overrides,
});
const days = (value: Prisma.Decimal) => Number(value);

describe('leave entitlement', () => {
  it('someone here all year gets the full annual allowance', () => {
    expect(days(entitlement(type(), year, d('2024-05-10'), d('2026-03-01')))).toBe(12);
  });
  it('a joiner in October gets the three months left of it', () => {
    expect(days(entitlement(type(), year, d('2026-10-05'), d('2026-10-05')))).toBe(3);
  });
  it('rounds down to the half day', () => {
    const odd = type({ annualAllowance: new Prisma.Decimal(10) });
    // 10 × 5 / 12 = 4.17 → 4
    expect(days(entitlement(odd, year, d('2026-08-01'), d('2026-08-01')))).toBe(4);
  });
  it('an organization can turn pro-rating off', () => {
    const flat = type({ prorateForJoiners: false });
    expect(days(entitlement(flat, year, d('2026-10-05'), d('2026-10-05')))).toBe(12);
  });
  it('monthly accrual grows with the months that have passed', () => {
    const monthly = type({ accrualType: 'MONTHLY', monthlyAccrual: new Prisma.Decimal(1.5) });
    expect(days(entitlement(monthly, year, null, d('2026-04-20')))).toBe(6);
    expect(days(entitlement(monthly, year, null, d('2026-09-02')))).toBe(13.5);
  });
  it('and stops at the end of the leave year', () => {
    const monthly = type({ accrualType: 'MONTHLY', monthlyAccrual: new Prisma.Decimal(1) });
    expect(days(entitlement(monthly, year, null, d('2027-03-01')))).toBe(12);
  });
  it('a monthly joiner accrues from their joining month', () => {
    const monthly = type({ accrualType: 'MONTHLY', monthlyAccrual: new Prisma.Decimal(1) });
    expect(days(entitlement(monthly, year, d('2026-06-15'), d('2026-08-01')))).toBe(3);
  });
  it('nothing for a year someone has not joined yet', () => {
    expect(days(entitlement(type(), year, d('2027-02-01'), d('2026-06-01')))).toBe(0);
  });
  it('manual and unaccrued types give nothing automatically', () => {
    expect(days(entitlement(type({ accrualType: 'MANUAL' }), year, null, d('2026-06-01')))).toBe(0);
  });
});

describe('carry forward when a leave year opens', () => {
  const context = {
    organizationId: 'org',
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set<string>(),
  } as unknown as Parameters<typeof reconcileBalance>[1];
  const balance = {
    id: 'new',
    employeeId: 'e',
    leaveTypeId: 't',
    periodStart: d('2027-01-01'),
    periodEnd: d('2027-12-31'),
    accruedAmount: new Prisma.Decimal(12),
  };

  const fakeTx = (previousAvailable: number | null, alreadyOpened = false) => {
    const writes: Array<{ type: string; amount: number; balance: string }> = [];
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const tx = {
      leaveBalanceTransaction: {
        findFirst: jest.fn().mockResolvedValue(alreadyOpened ? { id: 'x' } : null),
        create: jest.fn(
          ({
            data,
          }: {
            data: { transactionType: string; amount: unknown; leaveBalanceId: string };
          }) => {
            writes.push({
              type: data.transactionType,
              amount: Number(data.amount),
              balance: data.leaveBalanceId,
            });
            return Promise.resolve({});
          },
        ),
      },
      leaveBalance: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            previousAvailable === null
              ? null
              : { id: 'old', availableAmount: new Prisma.Decimal(previousAvailable) },
          ),
        update: jest.fn(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            updates.push({ id: where.id, data });
            return Promise.resolve({});
          },
        ),
      },
    } as unknown as Parameters<typeof reconcileBalance>[0];
    return { tx, writes, updates };
  };

  it('carries up to the limit and lapses the rest', async () => {
    const { tx, writes, updates } = fakeTx(8);
    const added = await reconcileBalance(
      tx,
      context,
      balance,
      type({ carryoverLimit: new Prisma.Decimal(5) }),
      null,
      d('2027-01-02'),
    );
    expect(Number(added)).toBe(5);
    expect(writes).toEqual(
      expect.arrayContaining([
        { type: 'EXPIRY', amount: -8, balance: 'old' },
        { type: 'OPENING', amount: 5, balance: 'new' },
      ]),
    );
    expect(updates.find((u) => u.id === 'old')?.data).toMatchObject({
      availableAmount: { decrement: new Prisma.Decimal(8) },
    });
  });
  it('a type with no limit carries nothing, and the old days lapse', async () => {
    const { tx, writes } = fakeTx(4);
    const added = await reconcileBalance(tx, context, balance, type(), null, d('2027-01-02'));
    expect(Number(added)).toBe(0);
    expect(writes).toContainEqual({ type: 'OPENING', amount: 0, balance: 'new' });
  });
  it('happens once: an opened year is left alone', async () => {
    const { tx, writes } = fakeTx(8, true);
    await reconcileBalance(
      tx,
      context,
      balance,
      type({ carryoverLimit: new Prisma.Decimal(5) }),
      null,
      d('2027-01-02'),
    );
    expect(writes).toHaveLength(0);
  });
});
