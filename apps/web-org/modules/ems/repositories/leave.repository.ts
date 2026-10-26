import {
  leavePreviewSchema,
  parseLeaveAssignmentList,
  parseLeaveBalanceList,
  parseLeaveInbox,
  parseLeaveRequest,
  parseLeaveRequestPage,
  parseLeaveTypeList,
  type LeaveAssignment,
  type LeaveBalance,
  type LeaveInboxEntry,
  type LeavePreview,
  type LeaveRequest,
  type LeaveType,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/**
 * Leave data access.
 *
 * Replaces a repository backed by `leave.json` and `localStorage`, where an application existed
 * only in the browser that filed it — invisible to the approver, to payroll, and to the same
 * person on another device.
 *
 * Balances are never computed here. The server owns entitlement, accrual, reservation and usage;
 * recomputing any of it client-side would produce a second, disagreeing answer.
 */

export type CreateLeaveRequestInput = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  branchId?: string;
  attachmentIds?: string[];
  session?: 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';
};

export type LeaveTypeInput = {
  code: string;
  name: string;
  paid: boolean;
  accrualType: 'NONE' | 'FIXED_ANNUAL' | 'MONTHLY' | 'PER_PAY_PERIOD' | 'MANUAL';
  annualAllowance?: number;
  monthlyAccrual?: number;
  carryoverLimit?: number;
  prorateForJoiners?: boolean;
  sandwichOffDays?: boolean;
  encashable?: boolean;
  maxEncashDays?: number;
  isCompOff?: boolean;
  compOffExpiryDays?: number;
  requiresAttachment: boolean;
};

/** One stretch of someone's leave on the team calendar. `type` is null when not the viewer's to know. */
export type LeaveCalendarEntry = {
  id: string;
  employeeId: string;
  name: string;
  employeeNumber: string;
  startDate: string;
  endDate: string;
  days: number;
  /** Dates accepted as worked during leave, so the calendar does not show the employee off. */
  workedDates?: string[];
  status: 'APPROVED' | 'PENDING';
  type: string | null;
  isYou: boolean;
};

export type LeaveAdminSummary = {
  pending: number;
  approvedThisMonth: number;
  employeesOnLeaveToday: number;
  approvedDaysTouchingMonth: number;
  month: string;
  asOf: string;
};

export const leaveRepository = {
  async adminSummary(organizationId: string): Promise<LeaveAdminSummary> {
    return (await apiRequest(`${orgPath(organizationId, '/leave')}/requests/summary`, {
      method: 'GET',
    })) as LeaveAdminSummary;
  },
  async dateAvailability(
    organizationId: string,
    from: string,
    to: string,
  ): Promise<{
    leaveYearStartMonth: number;
    dates: Array<{ date: string; reason: string | null }>;
  }> {
    return (await apiRequest(`${orgPath(organizationId, '/leave')}/requests/date-availability`, {
      method: 'POST',
      body: { from, to },
    })) as { leaveYearStartMonth: number; dates: Array<{ date: string; reason: string | null }> };
  },
  /** Who is off between two dates, among the people the caller works with. */
  async calendar(organizationId: string, from: string, to: string): Promise<LeaveCalendarEntry[]> {
    const payload = (await apiRequest(
      `${orgPath(organizationId, '/leave')}/calendar${queryString({ from, to })}`,
      { method: 'GET' },
    )) as { entries?: LeaveCalendarEntry[] };
    return payload.entries ?? [];
  },

  async listTypes(organizationId: string): Promise<LeaveType[]> {
    return expectShape(
      parseLeaveTypeList(
        await apiRequest(`${orgPath(organizationId, '/leave')}/types`, { method: 'GET' }),
      ),
      'leave type list',
    );
  },

  async listAssignments(organizationId: string): Promise<LeaveAssignment[]> {
    return expectShape(
      parseLeaveAssignmentList(
        await apiRequest(`${orgPath(organizationId, '/leave')}/assignments`, { method: 'GET' }),
      ),
      'leave assignment list',
    );
  },

  async listBalancePage(
    organizationId: string,
    filters: { search?: string; cursor?: string; limit?: number } = {},
  ) {
    const payload = await apiRequest(
      `${orgPath(organizationId, '/leave')}/balances/page${queryString(filters)}`,
      { method: 'GET' },
    );
    const envelope = payload as { nextCursor?: string };
    return {
      balances: expectShape(parseLeaveBalanceList(payload), 'leave balance page'),
      nextCursor: envelope.nextCursor,
    };
  },

  async listBalances(organizationId: string, employeeId?: string): Promise<LeaveBalance[]> {
    return expectShape(
      parseLeaveBalanceList(
        await apiRequest(
          `${orgPath(organizationId, '/leave')}/balances${queryString({ employeeId })}`,
          {
            method: 'GET',
          },
        ),
      ),
      'leave balance list',
    );
  },

  async listRequests(
    organizationId: string,
    filters: {
      employeeId?: string;
      limit?: number;
      status?: string;
      search?: string;
      departmentId?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<LeaveRequest[]> {
    const requests: LeaveRequest[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = expectShape(
        parseLeaveRequestPage(
          await apiRequest(
            `${orgPath(organizationId, '/leave')}/requests${queryString({ ...filters, cursor })}`,
            {
              method: 'GET',
            },
          ),
        ),
        'leave request list',
      );
      requests.push(...page.requests);
      // Explicit limits are for previews; the employee's full history follows every page.
      if (filters.limit) return requests;
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor))
        throw new Error('Leave history paging did not advance. Try again.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return requests;
  },

  async listRequestPage(
    organizationId: string,
    filters: {
      cursor?: string;
      status?: string;
      search?: string;
      employeeId?: string;
      departmentId?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) {
    return expectShape(
      parseLeaveRequestPage(
        await apiRequest(`${orgPath(organizationId, '/leave')}/requests${queryString(filters)}`, {
          method: 'GET',
        }),
      ),
      'leave request page',
    );
  },

  /** Requests awaiting the signed-in user's decision. */
  async requestInbox(organizationId: string): Promise<LeaveInboxEntry[]> {
    const items: LeaveInboxEntry[] = [];
    let cursor: string | undefined;
    do {
      const payload = (await apiRequest(
        `${orgPath(organizationId, '/leave')}/requests/inbox${queryString({ cursor, limit: 100 })}`,
        { method: 'GET' },
      )) as { requests: unknown[]; nextCursor?: string };
      items.push(...expectShape(parseLeaveInbox(payload), 'leave approval inbox'));
      if (payload.nextCursor === cursor && cursor)
        throw new Error('Approval paging did not advance.');
      cursor = payload.nextCursor;
    } while (cursor);
    return items;
  },

  async preview(organizationId: string, input: CreateLeaveRequestInput): Promise<LeavePreview> {
    return leavePreviewSchema.parse(
      await apiRequest(`${orgPath(organizationId, '/leave')}/requests/preview`, {
        method: 'POST',
        body: input,
      }),
    );
  },

  async createRequest(
    organizationId: string,
    input: CreateLeaveRequestInput,
  ): Promise<LeaveRequest> {
    return expectShape(
      parseLeaveRequest(
        await apiRequest(`${orgPath(organizationId, '/leave')}/requests`, {
          method: 'POST',
          body: input,
        }),
      ),
      'created leave request',
    );
  },

  /** Approves directly, or rejects with an audited comment. */
  async decide(
    organizationId: string,
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
    comment?: string,
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/leave')}/requests/${encodeURIComponent(requestId)}/decision`,
      { method: 'POST', body: { status, ...(comment?.trim() ? { comment: comment.trim() } : {}) } },
    );
  },

  /** The API requires a reason of at least three characters and audits it. */
  async cancel(organizationId: string, requestId: string, reason: string): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/leave')}/requests/${encodeURIComponent(requestId)}/cancel`,
      {
        method: 'POST',
        body: { reason },
      },
    );
  },

  async createType(organizationId: string, input: LeaveTypeInput): Promise<unknown> {
    return apiRequest(`${orgPath(organizationId, '/leave')}/types`, {
      method: 'POST',
      body: input,
    });
  },

  /** Everything but the code, which requests and balances refer to. */
  async updateType(
    organizationId: string,
    typeId: string,
    input: Omit<LeaveTypeInput, 'code'>,
  ): Promise<unknown> {
    return apiRequest(`${orgPath(organizationId, '/leave')}/types/${encodeURIComponent(typeId)}`, {
      method: 'PATCH',
      body: input,
    });
  },

  async assignTypeToBranch(
    organizationId: string,
    code: string,
    branchId: string,
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/leave')}/types/${encodeURIComponent(code)}/assign`,
      {
        method: 'POST',
        body: { branchId },
      },
    );
  },

  /** Manual balance adjustment. The API requires a reason of at least five characters. */
  async adjustBalance(
    organizationId: string,
    input: {
      employeeId: string;
      leaveTypeId: string;
      amount: number;
      reason: string;
      periodStart: string;
      periodEnd: string;
    },
  ): Promise<unknown> {
    return apiRequest(`${orgPath(organizationId, '/leave')}/balances/adjust`, {
      method: 'POST',
      body: input,
    });
  },
};
