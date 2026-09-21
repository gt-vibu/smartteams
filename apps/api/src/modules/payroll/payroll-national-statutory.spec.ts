import { Prisma } from '../../generated/prisma/client';
import { withNationalStatutoryRules } from './payroll-national-statutory';

const rule = (schemeCode: string, employeeRate: number) => ({
  schemeCode,
  employeeRate: new Prisma.Decimal(employeeRate),
  employerRate: null,
  wageCeiling: null,
  employeeThreshold: null,
  flatAmount: null,
  metadata: {},
});

describe('national statutory rules', () => {
  it('supplies EPF and ESI when the company has none, so they apply before a state is set', () => {
    const codes = withNationalStatutoryRules([]).map((entry) => entry.schemeCode);
    expect(codes).toEqual(['EPF', 'ESIC']);
  });

  it('never adds Professional Tax, whose slabs depend on the state', () => {
    expect(withNationalStatutoryRules([]).some((entry) => entry.schemeCode === 'PT')).toBe(false);
  });

  it('keeps a rule the company saved instead of the national one', () => {
    const rules = withNationalStatutoryRules([rule('PF', 10)]);
    expect(rules.filter((entry) => ['PF', 'EPF'].includes(entry.schemeCode))).toHaveLength(1);
    expect(Number(rules[0]?.employeeRate)).toBe(10);
    expect(rules.map((entry) => entry.schemeCode)).toContain('ESIC');
  });
});
