import { Prisma } from '../../generated/prisma/client';
import { PayrollRoundingMode } from '../../generated/prisma/enums';
import { computePayrollLine, type PayrollLineInput } from './payroll-line-calculator';

describe('payroll line statutory rules', () => {
  const item = (periodMonth: number, gross: number): PayrollLineInput => ({
    employeeId: 'employee-1',
    periodMonth,
    compensation: {
      baseAmount: new Prisma.Decimal(gross),
      grossSalary: new Prisma.Decimal(gross),
      overtimeMultiplier: new Prisma.Decimal(1),
    },
    employeePolicy: {
      payrollEnabled: true,
      pfEnabled: false,
      esiEnabled: false,
      ptEnabled: true,
      statutoryJurisdiction: 'KA',
    },
    policy: {
      payrollDayBasis: 30,
      basePercentage: new Prisma.Decimal(50),
      baseMinimum: new Prisma.Decimal(0),
      hraPercentage: new Prisma.Decimal(40),
      roundingMode: PayrollRoundingMode.HALF_UP,
      pfDefault: false,
      esiDefault: false,
      ptDefault: false,
      statutoryJurisdiction: 'KA',
    },
    statutoryRules: [
      {
        schemeCode: 'PT',
        employeeRate: null,
        employerRate: null,
        wageCeiling: null,
        employeeThreshold: new Prisma.Decimal(25_000),
        flatAmount: new Prisma.Decimal(200),
        metadata: {
          slabs: [
            {
              min: 25_000,
              max: null,
              amount: 200,
              monthOverrides: { '2': 300 },
            },
          ],
        },
      },
    ],
    components: [],
    timesheet: null,
    leave: { paidDays: 30, unpaidDays: 0 },
    attendance: { absentDays: 0, halfDays: 0 },
    unemployedDays: 0,
    periodWorkingDays: 30,
    adjustments: [],
    advances: [],
  });

  it('uses configured PT minimum inclusively and honors the configured February amount', () => {
    expect(computePayrollLine(item(1, 25_000), 480).statutory[0]!.employeeAmount).toEqual(
      new Prisma.Decimal(200),
    );
    expect(computePayrollLine(item(2, 25_000), 480).statutory[0]!.employeeAmount).toEqual(
      new Prisma.Decimal(300),
    );
    expect(computePayrollLine(item(2, 24_999), 480).statutory[0]!.employeeAmount).toEqual(
      new Prisma.Decimal(0),
    );
  });
});
