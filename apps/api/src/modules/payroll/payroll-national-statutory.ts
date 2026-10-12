import { Prisma } from '../../generated/prisma/client';

type Rule = {
  schemeCode: string;
  employeeRate: Prisma.Decimal | null;
  employerRate: Prisma.Decimal | null;
  wageCeiling: Prisma.Decimal | null;
  employeeThreshold: Prisma.Decimal | null;
  flatAmount: Prisma.Decimal | null;
  metadata: unknown;
};

const d = (value: number) => new Prisma.Decimal(value);

/**
 * PF and ESI are central schemes: the same rates in every state. They apply from the start, even
 * before the company sets its state. Only Professional Tax, whose slabs differ by state, waits
 * for that.
 *
 *  - EPF (Social Security Code, 2020): 12% employee and 12% employer on Basic, up to a
 *    ₹25,000 mandatory coverage wage ceiling from 17 September 2026 (₹15,000 before that date).
 *  - ESI (ESI Act, 1948): 0.75% employee and 3.25% employer on gross, while gross is ₹21,000 or less.
 *
 * A rule the company has saved for the scheme always wins over these.
 */
export const NATIONAL_STATUTORY_RULES: readonly Rule[] = [
  {
    schemeCode: 'EPF',
    employeeRate: d(12),
    employerRate: d(12),
    wageCeiling: d(25_000),
    employeeThreshold: null,
    flatAmount: null,
    metadata: { source: 'Social Security Code, 2020; Gazette S.O. 5109(E)' },
  },
  {
    schemeCode: 'ESIC',
    employeeRate: d(0.75),
    employerRate: d(3.25),
    wageCeiling: d(21_000),
    employeeThreshold: d(21_000),
    flatAmount: null,
    metadata: { source: 'ESI Act, 1948 (national default)' },
  },
];

const family = (code: string) => {
  const upper = code.toUpperCase();
  return upper === 'PF' ? 'EPF' : upper === 'ESI' ? 'ESIC' : upper;
};

/** The company's rules, plus the national PF and ESI rules for any scheme it has not saved. */
export function withNationalStatutoryRules<T extends Rule>(
  rules: readonly T[],
  effectiveDate: Date | string = new Date(),
): Array<T | Rule> {
  const present = new Set(rules.map((rule) => family(rule.schemeCode)));
  const date = typeof effectiveDate === 'string' ? new Date(effectiveDate) : effectiveDate;
  const epfCeiling = date < new Date('2026-09-17T00:00:00.000Z') ? d(15_000) : d(25_000);
  return [
    ...rules,
    ...NATIONAL_STATUTORY_RULES.filter((rule) => !present.has(rule.schemeCode)).map((rule) =>
      rule.schemeCode === 'EPF' ? { ...rule, wageCeiling: epfCeiling } : rule,
    ),
  ];
}
