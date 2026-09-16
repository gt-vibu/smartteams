import { Prisma } from '../../generated/prisma/client';
import { LeaveService } from './leave.service';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const BALANCE = '33333333-3333-4333-8333-333333333333';
const OWNER = '55555555-5555-4555-8555-555555555555';
const COLLEAGUE = '77777777-7777-4777-8777-777777777777';

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

function setup(status: 'PENDING' | 'APPROVED', callerEmployeeId: string | null = OWNER) {
  const tx = {
    // The caller's own employee record; by default the caller owns the request.
    employee: {
      findFirst: jest.fn().mockResolvedValue(callerEmployeeId ? { id: callerEmployeeId } : null),
    },
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
    // Cancelling an approved request also invalidates any calculated payroll run covering those
    // dates. `count: 0` means "no calculated run over this period", the ordinary case here.
    payrollRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    // Cancelling an approved request now takes the days back off the attendance calendar.
    // `null` here means "no attendance row for that date", which is the ordinary case and keeps
    // these tests about the balance ledger rather than about attendance.
    attendanceRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
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

/**
 * `leave.requests.write` is the permission every employee holds to raise their own leave. It used to
 * be all `cancel` checked, so any employee could cancel a colleague's request by id — an approved
 * one included, which reverses the ledger and reopens the colleague's attendance and payroll.
 */
describe('LeaveService.cancel ownership', () => {
  it("refuses to cancel a colleague's approved request", async () => {
    const { tx, service } = setup('APPROVED', COLLEAGUE);

    await expect(
      service.cancel(context(['leave.requests.write']), REQUEST, 'Plans changed'),
    ).rejects.toThrow('You may only act on your own records');
    expect(tx.leaveRequest.update).not.toHaveBeenCalled();
    expect(tx.leaveBalance.update).not.toHaveBeenCalled();
    expect(tx.leaveBalanceTransaction.create).not.toHaveBeenCalled();
  });

  it("refuses to cancel a colleague's pending request", async () => {
    const { tx, service } = setup('PENDING', COLLEAGUE);

    await expect(
      service.cancel(context(['leave.requests.write']), REQUEST, 'Plans changed'),
    ).rejects.toThrow('You may only act on your own records');
    expect(tx.leaveRequest.update).not.toHaveBeenCalled();
  });

  it('refuses a caller with no employee record', async () => {
    const { tx, service } = setup('PENDING', null);

    await expect(
      service.cancel(context(['leave.requests.write']), REQUEST, 'Plans changed'),
    ).rejects.toThrow('You may only act on your own records');
    expect(tx.leaveRequest.update).not.toHaveBeenCalled();
  });

  it('lets HR, who can see everyone’s leave, cancel on an employee’s behalf', async () => {
    const { tx, service } = setup('APPROVED', COLLEAGUE);

    await service.cancel(
      context(['leave.requests.write', 'leave.requests.read.all']),
      REQUEST,
      'Plans changed',
    );
    expect(tx.leaveRequest.update).toHaveBeenCalled();
    // The ownership lookup is skipped for a caller with breadth.
    expect(tx.employee.findFirst).not.toHaveBeenCalled();
  });

  it('leaves the wildcard admin unrestricted', async () => {
    const { tx, service } = setup('APPROVED', null);

    await service.cancel(context(['*']), REQUEST, 'Plans changed');
    expect(tx.leaveRequest.update).toHaveBeenCalled();
  });
});
