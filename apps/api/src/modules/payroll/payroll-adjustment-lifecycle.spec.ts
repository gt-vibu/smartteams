import { PayrollService } from './payroll.service';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '55555555-5555-4555-8555-555555555555';

function context(permissions: string[]): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

type RunRow = {
  id: string;
  organizationId: string;
  status: 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'RELEASED';
  calculationStaleAt: Date | null;
  periodStart: Date;
  periodEnd: Date;
};

function setup(run: Partial<RunRow> = {}) {
  const row: RunRow = {
    id: RUN,
    organizationId: ORG,
    status: 'CALCULATED',
    calculationStaleAt: null,
    periodStart: new Date('2026-08-01T00:00:00.000Z'),
    periodEnd: new Date('2026-08-31T00:00:00.000Z'),
    ...run,
  };
  const tx = {
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue(row),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row, ...args.data }),
      ),
    },
    employee: {
      findFirst: jest.fn().mockResolvedValue({ id: EMPLOYEE }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    payrollAdjustment: {
      create: jest.fn().mockResolvedValue({ id: 'adj', amount: 500 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    payrollApproval: { create: jest.fn() },
    payrollLineItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    payrollLineItemComponent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    payrollPayment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    salaryAdvanceRecovery: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    salaryAdvance: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    timesheet: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    organizationSettings: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ workWeekDays: [1, 2, 3, 4, 5], standardDayMinutes: 480 }),
    },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
    attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
    payrollPolicy: { findFirst: jest.fn().mockResolvedValue(null) },
    payrollStatutoryRule: { findMany: jest.fn().mockResolvedValue([]) },
    payrollCalendar: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit: unknown = { record: jest.fn().mockResolvedValue(undefined) };
  const outbox: unknown = { append: jest.fn().mockResolvedValue(undefined) };
  return {
    tx,
    row,
    service: new PayrollService(database as never, audit as never, outbox as never),
  };
}

const adjustment = {
  payrollRunId: RUN,
  employeeId: EMPLOYEE,
  type: 'BONUS' as const,
  amount: 500,
  description: 'Late bonus',
  taxable: true,
  source: 'NATIVE' as const,
};

/**
 * An adjustment written after a run was calculated used to be accepted, kept, and then silently
 * left out of the payslip, because nothing could recalculate the run. The adjustment now marks the
 * calculation stale, and a stale run cannot move forward until it is calculated again.
 */
describe('payroll adjustment lifecycle', () => {
  it('marks a calculated run stale when an adjustment is added', async () => {
    const { tx, service } = setup({ status: 'CALCULATED' });

    await service.addAdjustment(context(['payroll.adjustments.write']), adjustment);

    const [call] = tx.payrollRun.update.mock.calls as [{ data: { calculationStaleAt: Date } }][];
    expect(call?.[0].data.calculationStaleAt).toBeInstanceOf(Date);
  });

  it('leaves a draft run alone, because nothing has been calculated yet', async () => {
    const { tx, service } = setup({ status: 'DRAFT' });

    await service.addAdjustment(context(['payroll.adjustments.write']), adjustment);

    expect(tx.payrollRun.update).not.toHaveBeenCalled();
    expect(tx.payrollAdjustment.create).toHaveBeenCalled();
  });

  it('refuses approval while the calculation is stale', async () => {
    const { service } = setup({ status: 'CALCULATED', calculationStaleAt: new Date() });

    await expect(
      service.advance(context(['payroll.runs.approve']), RUN, 'APPROVED', 'Approved for release'),
    ).rejects.toThrow('calculate it again before approving or releasing it');
  });

  it('allows approval once the run is no longer stale', async () => {
    const { service } = setup({ status: 'CALCULATED', calculationStaleAt: null });

    await expect(
      service.advance(context(['payroll.runs.approve']), RUN, 'APPROVED', 'Approved for release'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });

  /**
   * A line item is held by its component rows under `onDelete: Restrict`. Recalculation has to
   * clear those first, or every employee with an assigned pay component makes it fail.
   */
  it('clears line-item components before deleting the line items it replaces', async () => {
    const { tx, service } = setup({ status: 'CALCULATED', calculationStaleAt: new Date() });

    await service.calculate(context(['payroll.runs.calculate']), RUN);

    const componentOrder = tx.payrollLineItemComponent.deleteMany.mock.invocationCallOrder[0];
    const lineItemOrder = tx.payrollLineItem.deleteMany.mock.invocationCallOrder[0];
    expect(componentOrder).toBeLessThan(lineItemOrder ?? Infinity);
  });

  it('refuses to recalculate a calculated run that is not stale', async () => {
    const { service } = setup({ status: 'CALCULATED', calculationStaleAt: null });

    await expect(service.calculate(context(['payroll.runs.calculate']), RUN)).rejects.toThrow(
      'Only a draft payroll run, or a calculated run with pending changes, can be calculated',
    );
  });
});
