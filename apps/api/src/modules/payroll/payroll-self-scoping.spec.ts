import { PayrollService } from './payroll.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { AccessMode } from '../../generated/prisma/enums';

const ORG = '11111111-1111-4111-8111-111111111111';
const CALLER_USER = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE_A = '55555555-5555-4555-8555-555555555555';
const EMPLOYEE_B = '66666666-6666-4666-8666-666666666666';

function context(permissions: string[], overrides: Partial<DomainContext> = {}): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: CALLER_USER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
    ...overrides,
  };
}

/**
 * `employee.findFirst` stands in for "which employee is the authenticated caller": payroll looks
 * the caller up by `userId`, so a request for someone else's id finds nothing.
 */
function setup(self: { id: string } | null = { id: EMPLOYEE_A }) {
  const tx = {
    employee: { findFirst: jest.fn().mockResolvedValue(self) },
    payslip: { findMany: jest.fn().mockResolvedValue([]) },
    payrollLineItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const stub: unknown = { record: jest.fn(), append: jest.fn() };
  return { tx, service: new PayrollService(database as never, stub as never, stub as never) };
}

type ListCall = [{ where: { employeeId?: string; organizationId: string } }];

function firstWhere(calls: unknown) {
  const call = (calls as unknown[])[0] as ListCall | undefined;
  if (!call) throw new Error('Expected the list query to have been issued');
  return call[0].where;
}

const payslipFilter = (tx: ReturnType<typeof setup>['tx']) =>
  firstWhere(tx.payslip.findMany.mock.calls);
const ledgerFilter = (tx: ReturnType<typeof setup>['tx']) =>
  firstWhere(tx.payrollLineItem.findMany.mock.calls);

describe('PayrollService.listPayslips self-scoping', () => {
  it('allows an employee to read their own payslips', async () => {
    const { tx, service } = setup();
    await service.listPayslips(context(['payroll.payslips.read']), EMPLOYEE_A);
    expect(payslipFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('rejects reading another employee', async () => {
    const { tx, service } = setup(null);
    await expect(
      service.listPayslips(context(['payroll.payslips.read']), EMPLOYEE_B),
    ).rejects.toThrow('Employees may only read their own payslips');
    expect(tx.payslip.findMany).not.toHaveBeenCalled();
  });

  it('narrows an unfiltered read to the caller', async () => {
    const { tx, service } = setup();
    await service.listPayslips(context(['payroll.payslips.read']));
    expect(payslipFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('lets read.all read another employee', async () => {
    const { tx, service } = setup();
    await service.listPayslips(
      context(['payroll.payslips.read', 'payroll.payslips.read.all']),
      EMPLOYEE_B,
    );
    expect(payslipFilter(tx).employeeId).toBe(EMPLOYEE_B);
  });

  it('leaves the wildcard admin unrestricted', async () => {
    const { tx, service } = setup();
    await service.listPayslips(context(['*']));
    expect(payslipFilter(tx).employeeId).toBeUndefined();
  });

  it('returns nothing to a federation grant that names no employee', async () => {
    const { tx, service } = setup();
    await expect(
      service.listPayslips(
        context(['payroll.payslips.read'], {
          accessMode: 'FEDERATION' as AccessMode,
          actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
        }),
      ),
    ).resolves.toEqual([]);
    expect(tx.payslip.findMany).not.toHaveBeenCalled();
  });
});

describe('PayrollService.ledger self-scoping', () => {
  it('allows an employee to read their own ledger', async () => {
    const { tx, service } = setup();
    await service.ledger(context(['payroll.ledger.read']), EMPLOYEE_A);
    expect(ledgerFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('rejects reading another employee', async () => {
    const { tx, service } = setup(null);
    await expect(service.ledger(context(['payroll.ledger.read']), EMPLOYEE_B)).rejects.toThrow(
      'Employees may only read their own payroll ledger',
    );
    expect(tx.payrollLineItem.findMany).not.toHaveBeenCalled();
  });

  it('narrows an unfiltered read to the caller', async () => {
    const { tx, service } = setup();
    await service.ledger(context(['payroll.ledger.read']));
    expect(ledgerFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('lets read.all read another employee', async () => {
    const { tx, service } = setup();
    await service.ledger(context(['payroll.ledger.read', 'payroll.ledger.read.all']), EMPLOYEE_B);
    expect(ledgerFilter(tx).employeeId).toBe(EMPLOYEE_B);
  });

  it('leaves the wildcard admin unrestricted', async () => {
    const { tx, service } = setup();
    await service.ledger(context(['*']));
    expect(ledgerFilter(tx).employeeId).toBeUndefined();
  });

  it('only ever returns released and locked runs', async () => {
    const { tx, service } = setup();
    await service.ledger(context(['*']));
    expect(ledgerFilter(tx)).toMatchObject({
      payrollRun: { status: { in: ['RELEASED', 'LOCKED'] } },
    });
  });
});
