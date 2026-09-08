import {
  parseJobTypeList,
  parseProject,
  parseTimesheet,
  parseTimesheetList,
  type JobType,
  type Project,
  type Timesheet,
} from '@smarteam/contracts';
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
  projectId?: string;
  projectName?: string;
  jobName?: string;
  workItem?: string;
  billable?: boolean;
  attachmentUrl?: string;
  startTime?: string;
  endTime?: string;
  timesheetId?: string;
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

  /** Lists reusable job/work types from backend */
  async listJobTypes(organizationId: string): Promise<JobType[]> {
    return (
      parseJobTypeList(await apiRequest(`${base(organizationId)}/job-types`, { method: 'GET' })) ??
      []
    );
  },

  /** Quick-adds a new reusable job/work type to the backend */
  async createJobType(organizationId: string, name: string): Promise<JobType> {
    return (await apiRequest(`${base(organizationId)}/job-types`, {
      method: 'POST',
      body: { name },
    })) as JobType;
  },

  /** Quick-adds a new project to the backend */
  async quickCreateProject(
    organizationId: string,
    name: string,
    description?: string,
  ): Promise<Project> {
    return expectShape(
      parseProject(
        await apiRequest(`${base(organizationId)}/projects`, {
          method: 'POST',
          body: { name, description },
        }),
      ),
      'project',
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
   */
  async derivePeriod(organizationId: string, periodId: string): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/periods/${encodeURIComponent(periodId)}/derive`, {
      method: 'POST',
    });
  },

  /**
   * Records a project-centric time entry. If timesheetId is provided, writes to that sheet;
   * otherwise writes to the direct entry endpoint which auto-resolves/provisions the draft sheet.
   */
  async addEntry(
    organizationId: string,
    timesheetId: string | undefined,
    input: ManualEntryInput,
  ): Promise<Timesheet> {
    const url = timesheetId
      ? `${base(organizationId)}/${encodeURIComponent(timesheetId)}/entries`
      : `${base(organizationId)}/entries`;

    return expectShape(
      parseTimesheet(
        await apiRequest(url, {
          method: 'POST',
          body: { ...input, timesheetId },
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

  async unsubmit(organizationId: string, timesheetId: string): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/${encodeURIComponent(timesheetId)}/unsubmit`, {
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
