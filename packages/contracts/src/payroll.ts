import { z } from 'zod';

/**
 * Payroll shapes, matching what `PayrollService` and `PayrollPolicyService` return.
 *
 * Every money field arrives as a Prisma `Decimal`, which serialises as a string. They are parsed
 * as `money` — a string or number coerced to a number for display only. Nothing in the frontend
 * may compute one: gross, deductions, statutory amounts and net pay are backend results, and a
 * figure that is not in the response is absent rather than derivable.
 */

/** A serialised Decimal. Accepts the string form the API sends and the number form tests use. */
const money = z.union([z.string(), z.number()]).transform((value) => Number(value));

export const payrollRunStatusSchema = z.enum([
  'DRAFT',
  'CALCULATED',
  'APPROVED',
  'RELEASED',
  'LOCKED',
  'CORRECTED',
  'VOIDED',
]);

export const payrollRunSchema = z.object({
  id: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  payFrequency: z.string().optional(),
  currencyCode: z.string().optional(),
  status: payrollRunStatusSchema,
  calculatedAt: z.string().nullable().optional(),
  /** Set when an input changed after calculation. Such a run cannot be approved or released. */
  calculationStaleAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  releasedAt: z.string().nullable().optional(),
  lockedAt: z.string().nullable().optional(),
  version: z.number().optional(),
});

export const payComponentSchema = z.object({
  componentCode: z.string(),
  componentName: z.string(),
  componentType: z.string(),
  amount: money,
});

export const payslipSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  externalEmployeeId: z.string().nullable().optional(),
  employeeNumber: z.string().nullable().optional(),
  status: z.string(),
  issuedAt: z.string().nullable().optional(),
  file: z.object({ id: z.string(), status: z.string() }).nullable().optional(),
  run: z.object({
    id: z.string().uuid(),
    periodStart: z.string(),
    periodEnd: z.string(),
    status: payrollRunStatusSchema,
    currencyCode: z.string().nullable().optional(),
  }),
  totals: z.object({
    grossAmount: money,
    deductionAmount: money,
    netAmount: money,
  }),
  /**
   * Empty when the employee's salary-slip mode hides the breakdown. An empty list means "not
   * disclosed", never "zero" — the screen has to say so rather than render nothing.
   */
  components: z.array(payComponentSchema),
});

const breakdownComponentSchema = z.object({
  code: z.string(),
  name: z.string(),
  componentType: z.string(),
  amount: money,
  isTaxable: z.boolean().optional(),
  eligible: z.boolean().optional(),
  basis: money.optional(),
  reason: z.string().optional(),
});

/**
 * The organisation's pay-component catalogue. `calculationType` decides which of `amount` or
 * `percentage` an assignment must carry, and the backend rejects the wrong one.
 */
export const payComponentDefinitionSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  componentType: z.enum(['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION']),
  calculationType: z.enum(['FIXED', 'PERCENTAGE_OF_BASE', 'FORMULA']),
  isTaxable: z.boolean(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().optional(),
});

/** An employee's assignment of a catalogue component, effective-dated by the backend. */
export const employeePayComponentSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  payComponentId: z.string().uuid(),
  amount: money.nullable().optional(),
  percentage: money.nullable().optional(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
  payComponent: payComponentDefinitionSchema.optional(),
});

export type PayComponentDefinition = z.infer<typeof payComponentDefinitionSchema>;
export type EmployeePayComponent = z.infer<typeof employeePayComponentSchema>;

export const payrollPolicySchema = z.object({
  id: z.string().uuid().optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().nullable().optional(),
  payrollDayBasis: z.number(),
  basePercentage: money,
  baseMinimum: money,
  hraPercentage: money,
  roundingMode: z.string(),
  pfDefault: z.boolean(),
  esiDefault: z.boolean(),
  ptDefault: z.boolean(),
  salarySlipDefault: z.boolean(),
  payrollEnabledDefault: z.boolean(),
  statutoryJurisdiction: z.string().nullable().optional(),
});

export const salaryProfileSchema = z.object({
  employeeId: z.string().uuid(),
  compensation: z
    .object({
      grossSalary: money.nullable().optional(),
      baseAmount: money.nullable().optional(),
      overtimeMultiplier: money.optional(),
      payType: z.string().optional(),
      payFrequency: z.string().optional(),
      effectiveFrom: z.string().optional(),
    })
    .nullable(),
  employeePolicy: z
    .object({
      payrollEnabled: z.boolean(),
      salarySlipMode: z.string(),
      pfEnabled: z.boolean(),
      esiEnabled: z.boolean(),
      ptEnabled: z.boolean(),
      statutoryJurisdiction: z.string().nullable().optional(),
    })
    .nullable(),
  organizationPolicy: payrollPolicySchema.optional(),
  structure: z.object({
    gross: money,
    base: money,
    hra: money,
    otherAllowance: money,
  }),
  components: z.array(employeePayComponentSchema).optional(),
  salaryBreakdown: z.object({
    gross: money,
    earnings: z.array(breakdownComponentSchema),
    deductions: z.array(breakdownComponentSchema),
    employerBenefits: z.array(breakdownComponentSchema),
    totalDeductions: money,
    totalEmployerBenefits: money,
    netPay: money,
  }),
});

export const salaryAdvanceSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  requestedAmount: money,
  approvedAmount: money.nullable().optional(),
  recoveredAmount: money,
  status: z.string(),
  reason: z.string().nullable().optional(),
  requestedAt: z.string(),
  approvedAt: z.string().nullable().optional(),
});

export const payrollPaymentSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  amount: money,
  status: z.string(),
  paymentMethod: z.string().nullable().optional(),
  paymentReference: z.string().nullable().optional(),
  paidAt: z.string().nullable().optional(),
  payrollRun: z
    .object({
      periodStart: z.string(),
      periodEnd: z.string(),
      status: payrollRunStatusSchema,
    })
    .optional(),
});

export const statutoryRuleSchema = z.object({
  id: z.string().uuid().optional(),
  schemeCode: z.string(),
  jurisdiction: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
  employeeRate: money.nullable().optional(),
  employerRate: money.nullable().optional(),
  wageCeiling: money.nullable().optional(),
  employeeThreshold: money.nullable().optional(),
  flatAmount: money.nullable().optional(),
});

export type PayrollPolicy = z.infer<typeof payrollPolicySchema>;
export type StatutoryRule = z.infer<typeof statutoryRuleSchema>;

export type PayrollRunStatus = z.infer<typeof payrollRunStatusSchema>;
export type PayrollRun = z.infer<typeof payrollRunSchema>;
export type Payslip = z.infer<typeof payslipSchema>;
export type PayslipComponent = z.infer<typeof payComponentSchema>;
export type SalaryProfile = z.infer<typeof salaryProfileSchema>;
export type SalaryBreakdownComponent = z.infer<typeof breakdownComponentSchema>;
export type SalaryAdvance = z.infer<typeof salaryAdvanceSchema>;
export type PayrollPayment = z.infer<typeof payrollPaymentSchema>;

function parseList<T>(schema: z.ZodType<T>, payload: unknown): T[] | null {
  const items =
    Array.isArray(payload) || payload === null || payload === undefined
      ? payload
      : ((payload as { items?: unknown }).items ?? payload);
  const result = z.array(schema).safeParse(items);
  return result.success ? result.data : null;
}

export const parsePayrollRunList = (payload: unknown) => parseList(payrollRunSchema, payload);
export const parsePayslipList = (payload: unknown) => parseList(payslipSchema, payload);
export const parseSalaryAdvanceList = (payload: unknown) => parseList(salaryAdvanceSchema, payload);
export const parsePayrollPaymentList = (payload: unknown) =>
  parseList(payrollPaymentSchema, payload);

export function parsePayrollRun(payload: unknown): PayrollRun | null {
  const result = payrollRunSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export const parsePayComponentList = (payload: unknown) =>
  parseList(payComponentDefinitionSchema, payload);

export function parsePayComponent(payload: unknown): PayComponentDefinition | null {
  const result = payComponentDefinitionSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export const parseStatutoryRuleList = (payload: unknown) => parseList(statutoryRuleSchema, payload);

export function parsePayrollPolicy(payload: unknown): PayrollPolicy | null {
  const result = payrollPolicySchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseSalaryProfile(payload: unknown): SalaryProfile | null {
  const result = salaryProfileSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/**
 * A calculated run whose inputs changed afterwards. The backend refuses to approve or release it
 * until it is calculated again; the UI reads this rather than deciding for itself.
 */
export function isCalculationStale(
  run: Pick<PayrollRun, 'status' | 'calculationStaleAt'>,
): boolean {
  return run.status === 'CALCULATED' && Boolean(run.calculationStaleAt);
}

/** The next status a run can move to, or null when it is finished or not ready. */
export function nextRunTransition(
  run: Pick<PayrollRun, 'status' | 'calculationStaleAt'>,
): 'CALCULATED' | 'APPROVED' | 'RELEASED' | 'LOCKED' | null {
  if (isCalculationStale(run)) return null;
  if (run.status === 'DRAFT') return 'CALCULATED';
  if (run.status === 'CALCULATED') return 'APPROVED';
  if (run.status === 'APPROVED') return 'RELEASED';
  if (run.status === 'RELEASED') return 'LOCKED';
  return null;
}

/** `₹1,23,456.78`, the only formatting the frontend is allowed to do to a backend figure. */
export function formatMoney(value: number | null | undefined, currencyCode = 'INR'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value);
}
