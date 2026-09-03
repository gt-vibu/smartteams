import { parseHoliday, parseHolidayList, type Holiday } from '@smarteam/contracts';
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
};
