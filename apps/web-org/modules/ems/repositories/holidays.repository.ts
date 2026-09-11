import {
  parseHoliday,
  parseHolidayList,
  parseHolidaySettings,
  parseEmployeeHolidaySummary,
  parseEmployeeHolidaySelectionList,
  parseEmployeeHolidayPolicy,
  parseEmployeeHolidayPolicyList,
  type Holiday,
  type HolidaySettings,
  type EmployeeHolidaySummary,
  type EmployeeHolidaySelection,
  type EmployeeHolidayPolicy,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/**
 * Holiday data access.
 *
 * The `Holiday` model and its consumers existed long before this repository — leave excludes an
 * active holiday from the working days it charges, and payroll counts them — but no route let a
 * tenant enter one, so `holidays.json` stood in for a calendar that could never affect anything.
 *
 * Dates are bounded server-side: `from`/`to` are real query parameters, not a client-side filter
 * over a full download.
 */

const base = (organizationId: string) => orgPath(organizationId, '/holidays');

export type HolidayInput = {
  name: string;
  holidayDate: string;
  branchId?: string;
  isOptional?: boolean;
};

export type EmployeeHolidayPolicyInput = {
  allowanceOverride: number | null;
  restrictedHolidayIds: string[];
};

export const holidaysRepository = {
  async list(
    organizationId: string,
    range: { from?: string; to?: string } = {},
  ): Promise<Holiday[]> {
    return expectShape(
      parseHolidayList(
        await apiRequest(`${base(organizationId)}${queryString(range)}`, { method: 'GET' }),
      ),
      'holiday list',
    );
  },

  async create(organizationId: string, input: HolidayInput): Promise<Holiday> {
    return expectShape(
      parseHoliday(await apiRequest(base(organizationId), { method: 'POST', body: input })),
      'holiday',
    );
  },

  /** Only the name and the optional flag are editable; the date is part of the uniqueness key. */
  async update(
    organizationId: string,
    holidayId: string,
    input: { name?: string; isOptional?: boolean },
  ): Promise<Holiday> {
    return expectShape(
      parseHoliday(
        await apiRequest(`${base(organizationId)}/${encodeURIComponent(holidayId)}`, {
          method: 'PATCH',
          body: input,
        }),
      ),
      'holiday',
    );
  },

  /** Retires a holiday. The API requires a reason and audits it; nothing is deleted. */
  async deactivate(organizationId: string, holidayId: string, reason: string): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/${encodeURIComponent(holidayId)}/deactivate`, {
      method: 'POST',
      body: { reason },
    });
  },

  /** Organization-wide holiday configuration (e.g. optional holiday allowance). */
  async getSettings(organizationId: string): Promise<HolidaySettings> {
    return expectShape(
      parseHolidaySettings(await apiRequest(`${base(organizationId)}/settings`, { method: 'GET' })),
      'holiday settings',
    );
  },

  async updateSettings(
    organizationId: string,
    input: { optionalHolidayAllowance: number },
  ): Promise<HolidaySettings> {
    return expectShape(
      parseHolidaySettings(
        await apiRequest(`${base(organizationId)}/settings`, {
          method: 'PATCH',
          body: input,
        }),
      ),
      'holiday settings',
    );
  },

  /** Employee self-service summary: mandatory holidays, optional pool, selections, and allowance usage. */
  async getMySummary(organizationId: string, year?: string): Promise<EmployeeHolidaySummary> {
    const query = year ? `?year=${encodeURIComponent(year)}` : '';
    return expectShape(
      parseEmployeeHolidaySummary(
        await apiRequest(`${base(organizationId)}/my-summary${query}`, { method: 'GET' }),
      ),
      'employee holiday summary',
    );
  },

  /** Employee selection of one or more eligible optional holidays from the pool. */
  async selectHolidays(
    organizationId: string,
    holidayIds: string[],
  ): Promise<EmployeeHolidaySummary | EmployeeHolidaySelection[]> {
    const raw = await apiRequest(`${base(organizationId)}/select`, {
      method: 'POST',
      body: { holidayIds },
    });
    const summary = parseEmployeeHolidaySummary(raw);
    if (summary) return summary;
    return expectShape(parseEmployeeHolidaySelectionList(raw), 'employee holiday selections');
  },

  /** Employee cancellation of a future selected optional holiday. */
  async cancelSelection(organizationId: string, holidayId: string): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/cancel`, {
      method: 'POST',
      body: { holidayId },
    });
  },

  /** Admin roster: view employee holiday selections across the organization. */
  async listSelections(
    organizationId: string,
    params: { year?: string; employeeId?: string; holidayId?: string } = {},
  ): Promise<EmployeeHolidaySelection[]> {
    return expectShape(
      parseEmployeeHolidaySelectionList(
        await apiRequest(`${base(organizationId)}/selections${queryString(params)}`, {
          method: 'GET',
        }),
      ),
      'employee holiday selections',
    );
  },

  // ─── Per-employee holiday policy ──────────────────────────────────────────

  /** Admin: list all employees with per-employee holiday policy overrides. */
  async listEmployeePolicies(organizationId: string): Promise<EmployeeHolidayPolicy[]> {
    return expectShape(
      parseEmployeeHolidayPolicyList(
        await apiRequest(`${base(organizationId)}/employee-policies`, { method: 'GET' }),
      ),
      'employee holiday policies',
    );
  },

  /** Admin: read the per-employee holiday policy for one employee. */
  async getEmployeePolicy(
    organizationId: string,
    employeeId: string,
  ): Promise<EmployeeHolidayPolicy | null> {
    const raw = await apiRequest(
      `${base(organizationId)}/employee-policies/${encodeURIComponent(employeeId)}`,
      { method: 'GET' },
    );
    if (!raw) return null;
    return parseEmployeeHolidayPolicy(raw);
  },

  /** Admin: create or update the per-employee holiday policy for one employee. */
  async upsertEmployeePolicy(
    organizationId: string,
    employeeId: string,
    input: EmployeeHolidayPolicyInput,
  ): Promise<EmployeeHolidayPolicy> {
    return expectShape(
      parseEmployeeHolidayPolicy(
        await apiRequest(
          `${base(organizationId)}/employee-policies/${encodeURIComponent(employeeId)}`,
          { method: 'PUT', body: input },
        ),
      ),
      'employee holiday policy',
    );
  },

  /** Admin: remove the per-employee holiday policy so the employee reverts to global defaults. */
  async deleteEmployeePolicy(organizationId: string, employeeId: string): Promise<unknown> {
    return apiRequest(
      `${base(organizationId)}/employee-policies/${encodeURIComponent(employeeId)}`,
      { method: 'DELETE' },
    );
  },
};
