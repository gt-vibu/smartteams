import {
  parsePayComponent,
  parsePayComponentList,
  parseOvertimeRates,
  parsePayrollPolicy,
  parsePayrollRun,
  parsePayrollRunList,
  parsePayslipList,
  parseSalaryAdvanceList,
  parseSalaryProfile,
  parseStatutoryRuleList,
  type PayComponentDefinition,
  type OvertimeRates,
  type PayrollPolicy,
  type PayrollRun,
  type PayrollRunStatus,
  type Payslip,
  type SalaryAdvance,
  type SalaryProfile,
  type StatutoryRule,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/** 0 means salary advances are turned off; recovery is in that many equal monthly shares. */
export type AdvanceRules = { limitPercent: number; recoveryMonths: number };

export type AdvanceAllowance = AdvanceRules & {
  monthlySalary: number | null;
  /** Null when the employee has no salary to measure against. */
  limit: number | null;
  outstanding: number;
  /** Asked for and waiting on a decision. */
  pending?: number;
  /** Approved and not yet taken back from pay. */
  repaying?: number;
  available: number;
};

export type PayrollRuleUpdateProposal = {
  id: string;
  sourceKey: string;
  schemeCode: string;
  jurisdiction: string;
  status: string;
  changeSummary: string;
  currentRule: Record<string, unknown> | null;
  proposedRule: Record<string, unknown> | null;
  impactPreview: Record<string, unknown> | null;
  effectiveFrom: string | null;
  createdAt: string;
};

export type PayrollRuleUpdates = {
  sources: Array<{
    key: string;
    schemeCode: string;
    jurisdiction: string;
  }>;
  checks: Array<{
    sourceKey: string;
    schemeCode: string;
    jurisdiction: string;
    checkedAt: string | null;
    sourceChangedAt: string | null;
    lastError: string | null;
  }>;
  proposals: PayrollRuleUpdateProposal[];
  unsupportedJurisdictions: string[];
  nextAutomaticCheck: string;
};

/**
 * Payroll data access.
 *
 * Replaces screens backed by `payroll.json`, `payroll-runs.json` and `localStorage`, where a
 * payslip's figures were invented in the browser: PF was the literal 1800, professional tax 200,
 * and income tax ten percent of gross. None of those numbers came from the backend, and none of
 * them agreed with what the payroll run had actually calculated.
 *
 * Nothing in this file computes money. Every amount is read from a response, and where the API
 * has no figure to give, the caller renders an unavailable state rather than deriving one.
 *
 * Reads are self-scoped by the API: without `payroll.payslips.read.all` (and the equivalents for
 * advances and the salary profile) the service narrows to the caller's own employee record and
 * refuses an `employeeId` for anyone else.
 */

const base = (organizationId: string) => orgPath(organizationId, '/payroll');

export type PayrollRunInput = {
  periodStart: string;
  periodEnd: string;
  payFrequency?: string;
};

export type PayrollAdjustmentInput = {
  payrollRunId: string;
  employeeId: string;
  type: 'BONUS' | 'DEDUCTION' | 'REIMBURSEMENT' | 'OVERTIME' | 'TAX' | 'OTHER';
  amount: number;
  description: string;
  taxable: boolean;
};

export const payrollRepository = {
  async listRuleUpdates(organizationId: string): Promise<PayrollRuleUpdates> {
    return (await apiRequest(`${base(organizationId)}/rule-updates`, {
      method: 'GET',
    })) as PayrollRuleUpdates;
  },

  async syncRuleSources(organizationId: string): Promise<{ queued: boolean; jobId: string }> {
    return (await apiRequest(`${base(organizationId)}/rule-updates/sync`, { method: 'POST' })) as {
      queued: boolean;
      jobId: string;
    };
  },

  async getRuleSyncStatus(
    organizationId: string,
    jobId: string,
  ): Promise<{
    state: string;
    result: { checked: number; changed: number; failed: number } | null;
    failedReason: string | null;
  }> {
    return (await apiRequest(
      `${base(organizationId)}/rule-updates/sync/${encodeURIComponent(jobId)}`,
      {
        method: 'GET',
      },
    )) as {
      state: string;
      result: { checked: number; changed: number; failed: number } | null;
      failedReason: string | null;
    };
  },

  async prepareRuleUpdate(
    organizationId: string,
    proposalId: string,
    input: {
      schemeCode: string;
      jurisdiction: string;
      effectiveFrom: string;
      effectiveTo?: string;
      employeeRate?: number;
      employerRate?: number;
      wageCeiling?: number;
      employeeThreshold?: number;
      flatAmount?: number;
      metadata?: Record<string, unknown>;
      note?: string;
    },
  ) {
    return apiRequest(`${base(organizationId)}/rule-updates/${encodeURIComponent(proposalId)}`, {
      method: 'PUT',
      body: input,
    });
  },

  async acceptRuleUpdate(organizationId: string, proposalId: string, note?: string) {
    return apiRequest(
      `${base(organizationId)}/rule-updates/${encodeURIComponent(proposalId)}/accept`,
      {
        method: 'POST',
        body: { note },
      },
    );
  },

  async rejectRuleUpdate(organizationId: string, proposalId: string, note?: string) {
    return apiRequest(
      `${base(organizationId)}/rule-updates/${encodeURIComponent(proposalId)}/reject`,
      {
        method: 'POST',
        body: { note },
      },
    );
  },

  /** Every run for the tenant, newest period first. Requires `payroll.runs.read`. */
  async listRuns(organizationId: string): Promise<PayrollRun[]> {
    return expectShape(
      parsePayrollRunList(await apiRequest(`${base(organizationId)}/runs`, { method: 'GET' })),
      'payroll run list',
    );
  },

  /**
   * Payslips, with the totals and components the run calculated.
   *
   * `employeeId` is only accepted from a caller allowed to read other employees; omitting it
   * returns the caller's own.
   */
  async listPayslips(organizationId: string, employeeId?: string): Promise<Payslip[]> {
    return expectShape(
      parsePayslipList(
        await apiRequest(`${base(organizationId)}/payslips${queryString({ employeeId })}`, {
          method: 'GET',
        }),
      ),
      'payslip list',
    );
  },

  /**
   * The employee's salary structure with the backend's own breakdown: earnings, deductions
   * (statutory included, each with its eligibility and basis) and employer contributions.
   */
  /** The profile worked out for a salary that is being typed. The server saves nothing. */
  async previewSalaryProfile(
    organizationId: string,
    input: {
      employeeId: string;
      grossSalary: number;
      pfEnabled: boolean;
      esiEnabled: boolean;
      ptEnabled: boolean;
    },
  ): Promise<SalaryProfile> {
    return expectShape(
      parseSalaryProfile(
        await apiRequest(`${base(organizationId)}/profile/preview`, {
          method: 'POST',
          body: input,
        }),
      ),
      'salary profile',
    );
  },

  async getSalaryProfile(organizationId: string, employeeId?: string): Promise<SalaryProfile> {
    return expectShape(
      parseSalaryProfile(
        await apiRequest(`${base(organizationId)}/profile${queryString({ employeeId })}`, {
          method: 'GET',
        }),
      ),
      'salary profile',
    );
  },

  /**
   * Salary advances, newest first, read a page at a time.
   *
   * The route used to return every advance in the tenant at once; it now pages. The pages are
   * followed here up to a fixed ceiling, so a long history cannot turn into an unbounded loop.
   */
  async listAdvances(organizationId: string, employeeId?: string): Promise<SalaryAdvance[]> {
    const MAX_PAGES = 25;
    const advances: SalaryAdvance[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await apiRequest(
        `${base(organizationId)}/advances${queryString({ employeeId, limit: 200, cursor })}`,
        { method: 'GET' },
      );
      advances.push(...expectShape(parseSalaryAdvanceList(payload), 'salary advance list'));
      cursor = nextCursorOf(payload);
      if (!cursor) break;
    }
    return advances;
  },

  /** The organization's advance limit (a share of monthly salary) and repayment months. */
  async getAdvanceRules(organizationId: string): Promise<AdvanceRules> {
    return (await apiRequest(`${base(organizationId)}/advance-rules`, {
      method: 'GET',
    })) as AdvanceRules;
  },

  async saveAdvanceRules(organizationId: string, input: AdvanceRules): Promise<AdvanceRules> {
    return (await apiRequest(`${base(organizationId)}/advance-rules`, {
      method: 'PUT',
      body: input,
    })) as AdvanceRules;
  },

  /** How much more the signed-in employee may ask for, and why. */
  async getAdvanceAllowance(organizationId: string): Promise<AdvanceAllowance> {
    return (await apiRequest(`${base(organizationId)}/advances/allowance`, {
      method: 'GET',
    })) as AdvanceAllowance;
  },

  async requestAdvance(
    organizationId: string,
    input: { employeeId: string; requestedAmount: number; reason: string },
  ): Promise<SalaryAdvance> {
    const payload = await apiRequest(`${base(organizationId)}/advances`, {
      method: 'POST',
      body: input,
    });
    return expectShape(parseSalaryAdvanceList([payload])?.[0] ?? null, 'salary advance');
  },

  /** Approves (optionally for less than asked) or rejects an advance; recovered by payroll. */
  async decideAdvance(
    organizationId: string,
    advanceId: string,
    input: { status: 'APPROVED' | 'REJECTED'; comment: string; approvedAmount?: number },
  ): Promise<unknown> {
    return apiRequest(
      `${base(organizationId)}/advances/${encodeURIComponent(advanceId)}/decision`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  async createRun(organizationId: string, input: PayrollRunInput): Promise<PayrollRun> {
    return expectShape(
      parsePayrollRun(
        await apiRequest(`${base(organizationId)}/runs`, { method: 'POST', body: input }),
      ),
      'payroll run',
    );
  },

  /**
   * Calculates a draft run, or recalculates one whose inputs changed after it was calculated.
   * The returned run is authoritative — the caller replaces its copy rather than assuming.
   */
  async calculateRun(
    organizationId: string,
    runId: string,
    deferAdvanceEmployeeIds: string[] = [],
  ): Promise<PayrollRun> {
    return expectShape(
      parsePayrollRun(
        await apiRequest(`${base(organizationId)}/runs/${runId}/calculate`, {
          method: 'POST',
          body: { deferAdvanceEmployeeIds },
        }),
      ),
      'payroll run',
    );
  },

  /**
   * Moves a run forward. The backend refuses a transition it does not allow, including approving
   * or releasing a run whose calculation went stale — the UI must not pre-empt that decision.
   */
  async advanceRun(
    organizationId: string,
    runId: string,
    target: PayrollRunStatus,
    comment: string,
  ): Promise<PayrollRun> {
    return expectShape(
      parsePayrollRun(
        await apiRequest(`${base(organizationId)}/runs/${runId}/action`, {
          method: 'POST',
          body: { target, ...(comment.trim() ? { comment: comment.trim() } : {}) },
        }),
      ),
      'payroll run',
    );
  },

  /** The organisation's pay-component catalogue. Requires `payroll.components.read`. */
  async listComponents(organizationId: string): Promise<PayComponentDefinition[]> {
    return expectShape(
      parsePayComponentList(
        await apiRequest(`${base(organizationId)}/components`, { method: 'GET' }),
      ),
      'pay component list',
    );
  },

  async createComponent(
    organizationId: string,
    input: {
      code: string;
      name: string;
      componentType: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
      calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE';
      isTaxable: boolean;
      displayOrder?: number;
    },
  ): Promise<PayComponentDefinition> {
    return expectShape(
      parsePayComponent(
        await apiRequest(`${base(organizationId)}/components`, { method: 'POST', body: input }),
      ),
      'pay component',
    );
  },

  /**
   * Assigns a catalogue component to an employee for a period.
   *
   * The backend validates the pairing — a fixed component needs an amount, a percentage component
   * a percentage, never both — and refuses an assignment overlapping an existing one. None of
   * that is re-implemented here.
   */
  async assignComponent(
    organizationId: string,
    input: {
      employeeId: string;
      payComponentId: string;
      amount?: number;
      percentage?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    },
  ): Promise<{ id: string }> {
    return (await apiRequest(`${base(organizationId)}/components/assignments`, {
      method: 'POST',
      body: input,
    })) as { id: string };
  },

  /** Saves the employee's gross salary and payroll flags. The structure itself is derived. */
  async saveSalaryProfile(
    organizationId: string,
    input: {
      employeeId: string;
      grossSalary: number;
      payType: string;
      payFrequency: string;
      overtimeMultiplier: number;
      effectiveFrom: string;
      payrollEnabled: boolean;
      salarySlipMode: string;
      pfEnabled: boolean;
      esiEnabled: boolean;
      ptEnabled: boolean;
    },
  ): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/profile`, { method: 'POST', body: input });
  },

  /** The organisation's payroll policy. Falls back server-side to a documented default. */
  async getPolicy(organizationId: string): Promise<PayrollPolicy> {
    return expectShape(
      parsePayrollPolicy(await apiRequest(`${base(organizationId)}/policy`, { method: 'GET' })),
      'payroll policy',
    );
  },

  /** Saves organization payroll policy settings and the default monthly gross salary. */
  async savePolicy(
    organizationId: string,
    input: {
      effectiveFrom: string;
      effectiveTo?: string;
      salarySlipDefault: boolean;
      payrollEnabledDefault: boolean;
      payrollDayBasis: number;
      basePercentage: number;
      baseMinimum: number;
      hraPercentage: number;
      defaultGrossSalary: number | null;
      pfDefault: boolean;
      esiDefault: boolean;
      ptDefault: boolean;
      statutoryJurisdiction?: string;
      roundingMode: 'HALF_UP' | 'DOWN' | 'UP';
    },
  ): Promise<PayrollPolicy> {
    return expectShape(
      parsePayrollPolicy(
        await apiRequest(`${base(organizationId)}/policy`, {
          method: 'PUT',
          body: input,
        }),
      ),
      'payroll policy',
    );
  },

  /** What overtime pays, as multiples of the hourly rate. */
  async getOvertimeRates(organizationId: string): Promise<OvertimeRates> {
    return expectShape(
      parseOvertimeRates(
        await apiRequest(`${base(organizationId)}/overtime-rates`, { method: 'GET' }),
      ),
      'overtime rates',
    );
  },

  async saveOvertimeRates(organizationId: string, input: OvertimeRates): Promise<OvertimeRates> {
    return expectShape(
      parseOvertimeRates(
        await apiRequest(`${base(organizationId)}/overtime-rates`, { method: 'PUT', body: input }),
      ),
      'overtime rates',
    );
  },

  /** The statutory rules payroll applies. Rates and ceilings are the backend's, never the UI's. */
  async listStatutoryRules(
    organizationId: string,
    jurisdiction?: string,
  ): Promise<StatutoryRule[]> {
    return expectShape(
      parseStatutoryRuleList(
        await apiRequest(
          `${base(organizationId)}/statutory-rules${queryString({ jurisdiction })}`,
          {
            method: 'GET',
          },
        ),
      ),
      'statutory rule list',
    );
  },

  async saveStatutoryRule(
    organizationId: string,
    input: Omit<StatutoryRule, 'id'>,
    ruleId?: string,
  ): Promise<StatutoryRule> {
    const payload = await apiRequest(
      `${base(organizationId)}/statutory-rules${ruleId ? `/${encodeURIComponent(ruleId)}` : ''}`,
      { method: ruleId ? 'PUT' : 'POST', body: input },
    );
    const parsed = parseStatutoryRuleList([payload]);
    return expectShape(parsed?.[0] ?? null, 'statutory rule');
  },

  async deleteStatutoryRule(organizationId: string, ruleId: string): Promise<void> {
    await apiRequest(`${base(organizationId)}/statutory-rules/${encodeURIComponent(ruleId)}`, {
      method: 'DELETE',
    });
  },

  /** Adds an adjustment. On a calculated run this marks the calculation stale server-side. */
  async addAdjustment(
    organizationId: string,
    input: PayrollAdjustmentInput,
  ): Promise<{ id: string }> {
    return (await apiRequest(`${base(organizationId)}/runs/${input.payrollRunId}/adjustments`, {
      method: 'POST',
      body: input,
    })) as { id: string };
  },
};

/** The paging cursor from a list envelope; absent on the last page. */
function nextCursorOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const cursor = (payload as { nextCursor?: unknown }).nextCursor;
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
}
