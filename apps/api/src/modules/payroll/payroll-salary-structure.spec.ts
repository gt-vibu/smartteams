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

  describe('statutory matrix test scenarios', () => {
    it('Scenario 1: PF below ceiling calculates 12% on actual basic', () => {
      const structure = calculateSalaryStructure(20_000, {
        basePercentage: 50,
        baseMinimum: 10_000,
        hraPercentage: 40,
        roundingMode: PayrollRoundingMode.HALF_UP,
      }); // base = 10,000 (< 15,000)
      const res = calculateStatutoryDeduction(
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
      );
      expect(res.employeeAmount).toEqual(new Prisma.Decimal(1_200));
      expect(res.employerAmount).toEqual(new Prisma.Decimal(1_200));
      expect(res.basis).toEqual(new Prisma.Decimal(10_000));
    });

    it('Scenario 2: PF above ceiling caps wage basis at statutory ceiling', () => {
      const structure = calculateSalaryStructure(50_000, policy); // base = 25,000 (> 15,000)
      const res = calculateStatutoryDeduction(
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
      );
      expect(res.employeeAmount).toEqual(new Prisma.Decimal(1_800));
      expect(res.employerAmount).toEqual(new Prisma.Decimal(1_800));
      expect(res.basis).toEqual(new Prisma.Decimal(15_000));
    });

    it('Scenario 3: PF with higher-wage option (uncapped) calculates on full basic', () => {
      const structure = calculateSalaryStructure(50_000, policy); // base = 25,000
      const res = calculateStatutoryDeduction(
        structure,
        {
          schemeCode: 'EPF',
          employeeRate: 12,
          employerRate: 12,
          wageCeiling: null, // uncapped
          employeeThreshold: null,
          metadata: {},
        },
        PayrollRoundingMode.HALF_UP,
      );
      expect(res.employeeAmount).toEqual(new Prisma.Decimal(3_000));
      expect(res.employerAmount).toEqual(new Prisma.Decimal(3_000));
      expect(res.basis).toEqual(new Prisma.Decimal(25_000));
    });

    it('Scenario 4: PF with 10% rate category calculates 10% on capped basic', () => {
      const structure = calculateSalaryStructure(50_000, policy);
      const res = calculateStatutoryDeduction(
        structure,
        {
          schemeCode: 'EPF',
          employeeRate: 10,
          employerRate: 10,
          wageCeiling: 15_000,
          employeeThreshold: null,
          metadata: {},
        },
        PayrollRoundingMode.HALF_UP,
      );
      expect(res.employeeAmount).toEqual(new Prisma.Decimal(1_500));
      expect(res.employerAmount).toEqual(new Prisma.Decimal(1_500));
    });

    it('Scenario 5: ESI below threshold calculates 0.75% employee and 3.25% employer', () => {
      const structure = calculateSalaryStructure(18_000, {
        basePercentage: 50,
        baseMinimum: 9_000,
        hraPercentage: 40,
        roundingMode: PayrollRoundingMode.HALF_UP,
      });
      const res = calculateStatutoryDeduction(
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
      );
      expect(res.eligible).toBe(true);
      expect(res.employeeAmount).toEqual(new Prisma.Decimal(135));
      expect(res.employerAmount).toEqual(new Prisma.Decimal(585));
    });

    it('Scenario 6: ESI exactly at 21,000 threshold is eligible', () => {
      const structure = calculateSalaryStructure(21_000, {
        basePercentage: 50,
        baseMinimum: 10_000,
        hraPercentage: 40,
        roundingMode: PayrollRoundingMode.HALF_UP,
      });
      const res = calculateStatutoryDeduction(
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
      );
      expect(res.eligible).toBe(true);
      expect(res.employeeAmount).toEqual(new Prisma.Decimal(157.5));
      expect(res.employerAmount).toEqual(new Prisma.Decimal(682.5));
    });

    it('Scenario 7: ESI above 21,000 threshold is exempt', () => {
      const structure = calculateSalaryStructure(22_000, policy);
      const res = calculateStatutoryDeduction(
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
      );
      expect(res.eligible).toBe(false);
      expect(res.employeeAmount).toEqual(new Prisma.Decimal(0));
      expect(res.employerAmount).toEqual(new Prisma.Decimal(0));
    });

    it('Scenario 8: Karnataka PT evaluates slab correctly below and above 25,000', () => {
      const ptRule = {
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
      };

      const belowSlab = calculateSalaryStructure(24_000, policy);
      expect(
        calculateStatutoryDeduction(belowSlab, ptRule, PayrollRoundingMode.HALF_UP).employeeAmount,
      ).toEqual(new Prisma.Decimal(0));

      const atSlab = calculateSalaryStructure(25_000, policy);
      expect(
        calculateStatutoryDeduction(atSlab, ptRule, PayrollRoundingMode.HALF_UP).employeeAmount,
      ).toEqual(new Prisma.Decimal(200));

      const aboveSlab = calculateSalaryStructure(75_000, policy);
      expect(
        calculateStatutoryDeduction(aboveSlab, ptRule, PayrollRoundingMode.HALF_UP).employeeAmount,
      ).toEqual(new Prisma.Decimal(200));
    });

    it('Scenario 9: Policy variations in Basic % and HRA % recalculate correctly', () => {
      // 40% Basic, 50% HRA
      const s1 = calculateSalaryStructure(100_000, {
        basePercentage: 40,
        baseMinimum: 15_000,
        hraPercentage: 50,
        roundingMode: PayrollRoundingMode.HALF_UP,
      });
      expect(s1.base).toEqual(new Prisma.Decimal(40_000));
      expect(s1.hra).toEqual(new Prisma.Decimal(20_000)); // 50% of 40k
      expect(s1.otherAllowance).toEqual(new Prisma.Decimal(40_000)); // 100k - 40k - 20k

      // 60% Basic, 40% HRA
      const s2 = calculateSalaryStructure(100_000, {
        basePercentage: 60,
        baseMinimum: 15_000,
        hraPercentage: 40,
        roundingMode: PayrollRoundingMode.HALF_UP,
      });
      expect(s2.base).toEqual(new Prisma.Decimal(60_000));
      expect(s2.hra).toEqual(new Prisma.Decimal(24_000)); // 40% of 60k
      expect(s2.otherAllowance).toEqual(new Prisma.Decimal(16_000)); // 100k - 60k - 24k
    });

    it('Scenario 10: PF wage basis evaluates custom wage basis (Basic + DA)', () => {
      const structure = calculateSalaryStructure(30_000, {
        basePercentage: 40, // Basic = 12,000
        baseMinimum: 10_000,
        hraPercentage: 40,
        roundingMode: PayrollRoundingMode.HALF_UP,
      });
      const daAmount = new Prisma.Decimal(2_500);
      const customPfWageBasis = structure.base.add(daAmount); // 12,000 + 2,500 = 14,500 (< 15,000 ceiling)
      const res = calculateStatutoryDeduction(
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
        structure,
        customPfWageBasis,
      );
      expect(res.basis).toEqual(new Prisma.Decimal(14_500));
      expect(res.employeeAmount).toEqual(new Prisma.Decimal(1_740)); // 12% of 14,500
      expect(res.employerAmount).toEqual(new Prisma.Decimal(1_740));
    });

    it('Scenario 11: Karnataka PT applies ₹200 for regular months and ₹300 for February', () => {
      const ptRule = {
        schemeCode: 'PT',
        employeeRate: null,
        employerRate: null,
        wageCeiling: null,
        employeeThreshold: 25_000,
        flatAmount: 200,
        metadata: {
          slabs: [
            { min: 0, max: 24_999.99, amount: 0 },
            { min: 25_000, max: null, amount: 200, monthOverrides: { '2': 300 } },
          ],
        },
      };
      const structure = calculateSalaryStructure(50_000, policy);
      const jan = calculateStatutoryDeduction(
        structure,
        ptRule,
        PayrollRoundingMode.HALF_UP,
        structure,
        undefined,
        1,
      );
      const feb = calculateStatutoryDeduction(
        structure,
        ptRule,
        PayrollRoundingMode.HALF_UP,
        structure,
        undefined,
        2,
      );
      const mar = calculateStatutoryDeduction(
        structure,
        ptRule,
        PayrollRoundingMode.HALF_UP,
        structure,
        undefined,
        3,
      );
      const dec = calculateStatutoryDeduction(
        structure,
        ptRule,
        PayrollRoundingMode.HALF_UP,
        structure,
        undefined,
        12,
      );

      expect(jan.employeeAmount).toEqual(new Prisma.Decimal(200));
      expect(feb.employeeAmount).toEqual(new Prisma.Decimal(300));
      expect(mar.employeeAmount).toEqual(new Prisma.Decimal(200));
      expect(dec.employeeAmount).toEqual(new Prisma.Decimal(200));

      // Annual total for Apr-Mar cycle: 11 months * 200 + 1 month (Feb) * 300 = 2,500
      let annualPt = new Prisma.Decimal(0);
      for (let month = 1; month <= 12; month++) {
        const res = calculateStatutoryDeduction(
          structure,
          ptRule,
          PayrollRoundingMode.HALF_UP,
          structure,
          undefined,
          month,
        );
        annualPt = annualPt.add(res.employeeAmount);
      }
      expect(annualPt).toEqual(new Prisma.Decimal(2_500));

      // Employee earning < 25,000 is 0 across all months including February
      const lowSalary = calculateSalaryStructure(20_000, policy);
      const lowFeb = calculateStatutoryDeduction(
        lowSalary,
        ptRule,
        PayrollRoundingMode.HALF_UP,
        lowSalary,
        undefined,
        2,
      );
      expect(lowFeb.employeeAmount).toEqual(new Prisma.Decimal(0));
    });
  });
});
