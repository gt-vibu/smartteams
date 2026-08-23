import { Prisma } from '../../generated/prisma/client';
import { PayrollRoundingMode } from '../../generated/prisma/enums';
import {
  calculateSalaryStructure,
  calculateStatutoryDeduction,
  prorateSalaryStructure,
} from './payroll-salary-structure';
import { summarizeAttendance, summarizeLeave } from './payroll-calculation';

const policy = {
  basePercentage: 50,
  baseMinimum: 15_000,
  hraPercentage: 40,
  roundingMode: PayrollRoundingMode.HALF_UP,
};

describe('salary structure calculation', () => {
  it.each([
    [10_000, 10_000, 0, 0],
    [20_000, 15_000, 5_000, 0],
    [50_000, 25_000, 10_000, 15_000],
  ])('keeps gross fixed at %s', (gross, base, hra, otherAllowance) => {
    expect(calculateSalaryStructure(gross, policy)).toMatchObject({
      gross: new Prisma.Decimal(gross),
      base: new Prisma.Decimal(base),
      hra: new Prisma.Decimal(hra),
      otherAllowance: new Prisma.Decimal(otherAllowance),
    });
  });

  it('prorates the original structure without rebuilding it from reduced gross', () => {
    const structure = calculateSalaryStructure(30_000, policy);
    expect(prorateSalaryStructure(structure, 27, 30, PayrollRoundingMode.HALF_UP)).toMatchObject({
      gross: new Prisma.Decimal(27_000),
      base: new Prisma.Decimal(13_500),
      hra: new Prisma.Decimal(5_400),
      otherAllowance: new Prisma.Decimal(8_100),
    });
  });

  it('applies statutory rates and thresholds from the rule snapshot', () => {
    const structure = calculateSalaryStructure(50_000, policy);
    expect(
      calculateStatutoryDeduction(
        structure,
        {
          schemeCode: 'EPF',
          employeeRate: 12,
          employerRate: 12,
          wageCeiling: 15_000,
          employeeThreshold: null,
          metadata: {},
        },
        PayrollRoundingMode.HALF_UP,
      ).employeeAmount,
    ).toEqual(new Prisma.Decimal(1_800));

    expect(
      calculateStatutoryDeduction(
        structure,
        {
          schemeCode: 'ESIC',
          employeeRate: 0.75,
          employerRate: 3.25,
          wageCeiling: 21_000,
          employeeThreshold: 21_000,
          metadata: {},
        },
        PayrollRoundingMode.HALF_UP,
      ).employeeAmount,
    ).toEqual(new Prisma.Decimal(0));

    expect(
      calculateStatutoryDeduction(
        structure,
        {
          schemeCode: 'PT',
          employeeRate: null,
          employerRate: null,
          wageCeiling: null,
          employeeThreshold: 25_000,
          flatAmount: 200,
          metadata: {},
        },
        PayrollRoundingMode.HALF_UP,
      ).employeeAmount,
    ).toEqual(new Prisma.Decimal(200));

    expect(
      calculateStatutoryDeduction(
        calculateSalaryStructure(20_000, policy),
        {
          schemeCode: 'PT',
          employeeRate: null,
          employerRate: null,
          wageCeiling: null,
          employeeThreshold: null,
          flatAmount: null,
          metadata: {
            slabs: [
              { min: 0, max: 24_999.99, amount: 0 },
              { min: 25_000, max: null, amount: 200 },
            ],
          },
        },
        PayrollRoundingMode.HALF_UP,
      ).employeeAmount,
    ).toEqual(new Prisma.Decimal(0));
  });

  it('turns recorded absent and half-day attendance into payable-day reductions', () => {
    expect(
      summarizeAttendance([
        { dayStatus: 'PRESENT' },
        { dayStatus: 'ABSENT' },
        { dayStatus: 'HALF_DAY' },
      ]),
    ).toEqual({ absentDays: 1, halfDays: 1 });
  });

  it('clips leave impact to the payroll period', () => {
    expect(
      summarizeLeave(
        [
          {
            requestedDays: new Prisma.Decimal(4),
            startDate: new Date('2026-08-30T00:00:00.000Z'),
            endDate: new Date('2026-09-02T00:00:00.000Z'),
            leaveType: { paid: false },
          },
        ],
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-09-30T00:00:00.000Z'),
      ),
    ).toEqual({ paidDays: 0, unpaidDays: 2 });
  });

  it('uses monthly wages for statutory eligibility while prorating contributions', () => {
    const monthly = calculateSalaryStructure(30_000, policy);
    const prorated = prorateSalaryStructure(monthly, 20, 30, PayrollRoundingMode.HALF_UP);
    expect(
      calculateStatutoryDeduction(
        prorated,
        {
          schemeCode: 'ESIC',
          employeeRate: 0.75,
          employerRate: 3.25,
          wageCeiling: 21_000,
          employeeThreshold: 21_000,
          metadata: {},
        },
        PayrollRoundingMode.HALF_UP,
        monthly,
      ).eligible,
    ).toBe(false);
  });
});
