import {
  parseLeaveAssignmentList,
  parseLeaveBalanceList,
  parseLeaveInbox,
  parseLeaveRequest,
  parseLeaveRequestPage,
  parseLeaveTypeList,
  type LeaveAssignment,
  type LeaveBalance,
  type LeaveInboxEntry,
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
};

export type LeaveTypeInput = {
  code: string;
  name: string;
  paid: boolean;
  accrualType: 'NONE' | 'FIXED_ANNUAL' | 'MONTHLY' | 'PER_PAY_PERIOD' | 'MANUAL';
  annualAllowance?: number;
  monthlyAccrual?: number;
  carryoverLimit?: number;
  requiresAttachment: boolean;
};

export const leaveRepository = {
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
    filters: { employeeId?: string; limit?: number } = {},
  ): Promise<LeaveRequest[]> {
    return expectShape(
      parseLeaveRequestPage(
        await apiRequest(`${orgPath(organizationId, '/leave')}/requests${queryString(filters)}`, {
          method: 'GET',
        }),
      ),
      'leave request list',
    ).requests;
  },

  /** Requests awaiting the signed-in user's decision. */
  async requestInbox(organizationId: string): Promise<LeaveInboxEntry[]> {
    return expectShape(
      parseLeaveInbox(
        await apiRequest(`${orgPath(organizationId, '/leave')}/requests/inbox`, { method: 'GET' }),
      ),
      'leave approval inbox',
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

  /** The API requires a comment of at least two characters and audits it. */
  async decide(
    organizationId: string,
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string,
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/leave')}/requests/${encodeURIComponent(requestId)}/decision`,
      { method: 'POST', body: { status, comment } },
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
