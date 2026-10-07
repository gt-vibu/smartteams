import { Prisma } from '../../generated/prisma/client';
import { mergeSalaryComponents } from './payroll-component-rules';

describe('mergeSalaryComponents', () => {
  it('shows calculated overtime, adjustments, and advance recovery in payslip details', () => {
    const rows = mergeSalaryComponents([], {
      proratedStructure: { base: '5333.33', hra: '2133.33', otherAllowance: '3200.01' },
      overtime: '500.00',
      earningAdjustmentTotal: '250.00',
      deductionAdjustmentTotal: '100.00',
      advanceRecoveryTotal: '2300.00',
      statutory: [
        { schemeCode: 'EPF', employeeAmount: '640.00' },
        { schemeCode: 'PT', employeeAmount: '200.00' },
      ],
    });

    expect(
      rows
        .filter((row) => row.componentType === 'DEDUCTION')
        .reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0))
        .toFixed(2),
    ).toBe('3240.00');
    expect(rows.map((row) => row.componentName)).toEqual(
      expect.arrayContaining([
        'Overtime',
        'Additional earnings',
        'Other deductions',
        'Salary advance recovery',
        'EPF',
        'Professional tax',
      ]),
    );
  });

  it('does not invent zero-value breakdown rows or duplicate existing components', () => {
    const rows = mergeSalaryComponents(
      [
        {
          componentCode: 'PAYROLL_ADVANCE_RECOVERY',
          componentName: 'Advance recovery',
          componentType: 'DEDUCTION',
          amount: new Prisma.Decimal(25),
        },
      ],
      { advanceRecoveryTotal: '2300.00', overtime: '0' },
    );

    expect(rows.filter((row) => row.componentCode === 'PAYROLL_ADVANCE_RECOVERY')).toHaveLength(1);
    expect(rows.some((row) => row.componentCode === 'PAYROLL_OVERTIME')).toBe(false);
  });
});
