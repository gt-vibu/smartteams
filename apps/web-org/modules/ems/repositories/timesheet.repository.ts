import { parseTimesheet, parseTimesheetList, type Timesheet } from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/**
 * Timesheet data access.
 *
 * Replaces a repository backed by `timesheets.json` and `localStorage`, where a logged hour
 * existed only in the browser that logged it — invisible to the approver and to payroll, which
 * prices overtime from these minutes.
 *
 * The API self-scopes reads: without `timesheets.read.all` the service narrows the query to the
 * caller's own employee record and rejects an `employeeId` for anyone else. Nothing here needs
 * to enforce that, and nothing here should try to work around it.
 */

const base = (organizationId: string) => orgPath(organizationId, '/timesheets');

export type ManualEntryInput = {
  workDate: string;
  minutes: number;
  overtimeMinutes?: number;
  description?: string;
};

export const timesheetRepository = {
  async list(
    organizationId: string,
    filters: { employeeId?: string; periodId?: string } = {},
  ): Promise<Timesheet[]> {
    return expectShape(
      parseTimesheetList(
        await apiRequest(`${base(organizationId)}${queryString(filters)}`, { method: 'GET' }),
      ),
      'timesheet list',
    );
  },

  /** Opens a period. Timesheets are derived into it afterwards. */
  async createPeriod(
    organizationId: string,
    input: { periodType: string; periodStart: string; periodEnd: string },
  ): Promise<{ id: string }> {
    return (await apiRequest(`${base(organizationId)}/periods`, {
      method: 'POST',
      body: input,
    })) as { id: string };
  },

  /**
   * Builds timesheets for a period from recorded attendance.
   *
   * This is the only route that creates timesheets in bulk; entries added by hand go through
   * `addEntry` against an existing sheet.
   */
  async derivePeriod(organizationId: string, periodId: string): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/periods/${encodeURIComponent(periodId)}/derive`, {
      method: 'POST',
    });
  },

  async addEntry(
    organizationId: string,
    timesheetId: string,
    input: ManualEntryInput,
  ): Promise<Timesheet> {
    return expectShape(
      parseTimesheet(
        await apiRequest(`${base(organizationId)}/${encodeURIComponent(timesheetId)}/entries`, {
          method: 'POST',
          body: input,
        }),
      ),
      'timesheet entry',
    );
  },

  async submit(organizationId: string, timesheetId: string): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/${encodeURIComponent(timesheetId)}/submit`, {
      method: 'POST',
    });
  },

  /** The API requires a comment of at least two characters and audits it. */
  async decide(
    organizationId: string,
    timesheetId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string,
  ): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/${encodeURIComponent(timesheetId)}/decision`, {
      method: 'POST',
      body: { status, comment },
    });
  },
};
