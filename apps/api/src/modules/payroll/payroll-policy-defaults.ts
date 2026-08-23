import { PayrollRoundingMode } from '../../generated/prisma/enums';
import type { SalaryStructurePolicy } from './payroll-salary-structure';

export type PayrollPolicyDefaults = SalaryStructurePolicy & {
  salarySlipDefault: boolean;
  payrollEnabledDefault: boolean;
  payrollDayBasis: number;
  pfDefault: boolean;
  esiDefault: boolean;
  ptDefault: boolean;
  statutoryJurisdiction: string | null;
};

export const DEFAULT_PAYROLL_POLICY: PayrollPolicyDefaults = {
  salarySlipDefault: true,
  payrollEnabledDefault: true,
  payrollDayBasis: 30,
  basePercentage: 50,
  baseMinimum: 15_000,
  hraPercentage: 40,
  pfDefault: false,
  esiDefault: false,
  ptDefault: false,
  statutoryJurisdiction: null,
  roundingMode: PayrollRoundingMode.HALF_UP,
};
