import { Prisma } from '../../generated/prisma/client';
import { LeaveService } from './leave.service';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const BALANCE = '33333333-3333-4333-8333-333333333333';

function context(permissions: string[]): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
    reason: 'Plans changed',
  };
}

function setup(status: 'PENDING' | 'APPROVED') {
  const tx = {
    leaveRequest: {
      findFirst: jest.fn().mockResolvedValue({
        id: REQUEST,
        organizationId: ORG,
        employeeId: '55555555-5555-4555-8555-555555555555',
        leaveTypeId: '66666666-6666-4666-8666-666666666666',
        startDate: new Date('2026-09-07'),
        endDate: new Date('2026-09-09'),
        requestedDays: new Prisma.Decimal(3),
        status,
        version: 1,
      }),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: REQUEST,
          organizationId: ORG,
          employeeId: '55555555-5555-4555-8555-555555555555',
          leaveTypeId: '66666666-6666-4666-8666-666666666666',
          startDate: new Date('2026-09-07'),
          endDate: new Date('2026-09-09'),
          requestedDays: new Prisma.Decimal(3),
          status: 'CANCELLED',
          version: 2,
          ...args.data,
        }),
      ),
    },
    leaveBalance: {
      findFirst: jest.fn().mockResolvedValue({ id: BALANCE }),
      update: jest.fn().mockResolvedValue({}),
    },
    leaveBalanceTransaction: { create: jest.fn().mockResolvedValue({}) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit: unknown = { record: jest.fn().mockResolvedValue(undefined) };
  // The service also takes an outbox publisher; cancellation does not use it, so a stub is enough.
  const outbox = { publish: jest.fn().mockResolvedValue(undefined) };
  return { tx, service: new LeaveService(database as never, audit as never, outbox as never) };
}

/**
 * Cancelling an approved request has to give the days back to `availableAmount`, not merely take
 * them out of `usedAmount`. Without that the employee is left with entitlement that is neither
 * used, reserved, nor available — the days are silently destroyed, and nothing in the UI would
 * reveal where they went.
 */
describe('LeaveService.cancel', () => {
  it('returns an approved request to available as well as clearing usage', async () => {
    const { tx, service } = setup('APPROVED');

    await service.cancel(context(['leave.requests.write']), REQUEST, 'Plans changed');

    const [call] = tx.leaveBalance.update.mock.calls as [{ data: Record<string, unknown> }][];
    expect(call?.[0].data).toMatchObject({
      usedAmount: { decrement: 3 },
      availableAmount: { increment: 3 },
    });
  });

  it('releases the reservation for a pending request', async () => {
    const { tx, service } = setup('PENDING');

    await service.cancel(context(['leave.requests.write']), REQUEST, 'Plans changed');

    const [call] = tx.leaveBalance.update.mock.calls as [{ data: Record<string, unknown> }][];
    expect(call?.[0].data).toMatchObject({
      reservedAmount: { decrement: 3 },
      availableAmount: { increment: 3 },
    });
  });

  it('records a ledger entry so the movement is auditable', async () => {
    const { tx, service } = setup('APPROVED');

    await service.cancel(context(['leave.requests.write']), REQUEST, 'Plans changed');

    const [call] = tx.leaveBalanceTransaction.create.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    expect(call?.[0].data).toMatchObject({
      transactionType: 'REVERSAL',
      leaveRequestId: REQUEST,
    });
  });

  it('marks the request cancelled rather than deleting it', async () => {
    const { tx, service } = setup('APPROVED');

    await service.cancel(context(['leave.requests.write']), REQUEST, 'Plans changed');

    const [call] = tx.leaveRequest.update.mock.calls as [{ data: Record<string, unknown> }][];
    expect(call?.[0].data).toMatchObject({ status: 'CANCELLED' });
  });
});
