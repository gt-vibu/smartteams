import { PayrollRunReviewService } from './payroll-run-review.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';

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

function setup(run: { id: string; status: string } | null = { id: RUN, status: 'CALCULATED' }) {
  const tx = {
    payrollRun: { findFirst: jest.fn().mockResolvedValue(run) },
    payrollLineItem: {
      findMany: jest.fn().mockResolvedValue([
        {
          employeeId: 'a',
          grossAmount: '50000.00',
          deductionAmount: '1800.00',
          netAmount: '48200.00',
          calculationBreakdown: { regular: '50000.00', advanceRecoveryTotal: '0' },
          employee: { firstName: 'Asha', lastName: 'Rao', employeeNumber: 'EMP001' },
        },
        {
          employeeId: 'b',
          grossAmount: '0',
          deductionAmount: '0',
          netAmount: '0',
          calculationBreakdown: null,
          employee: { firstName: 'Ben', lastName: 'Das', employeeNumber: 'EMP002' },
        },
      ]),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  } as unknown as TenantDatabaseService;
  return { service: new PayrollRunReviewService(database), tx };
}

describe('PayrollRunReviewService', () => {
  const reviewer = ['payroll.runs.read', 'payroll.payslips.read.all'];

  it('lists each person’s figures and the run totals before release', async () => {
    const { service } = setup();
    const review = await service.review(context(reviewer), RUN);
    expect(review.items).toEqual([
      expect.objectContaining({
        name: 'Asha Rao',
        gross: 50000,
        deductions: 1800,
        net: 48200,
      }),
      expect.objectContaining({ name: 'Ben Das', gross: 0, net: 0 }),
    ]);
    expect(review.items[0]?.breakdown).toMatchObject({ regularPay: 50000, advanceRecovery: 0 });
    expect(review.totals).toEqual({ gross: 50000, deductions: 1800, net: 48200 });
  });

  it('needs the right to read everyone’s pay, not only to see runs', async () => {
    const { service, tx } = setup();
    await expect(service.review(context(['payroll.runs.read']), RUN)).rejects.toThrow(
      /every employee/,
    );
    expect(tx.payrollLineItem.findMany).not.toHaveBeenCalled();
  });

  it('answers not found for a run in no organization the caller can see', async () => {
    const { service } = setup(null);
    await expect(service.review(context(reviewer), RUN)).rejects.toThrow(/not found/i);
  });
});
