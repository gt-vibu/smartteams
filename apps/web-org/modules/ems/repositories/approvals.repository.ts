import {
  parseApprovalPolicy,
  parseApprovalPolicyList,
  type ApprovalPolicy,
  type ApprovalStep,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

/**
 * Approval policy data access.
 *
 * Replaces a builder backed by `approval-policies.json` and `localStorage`, where a routing rule
 * existed only in the browser that wrote it — so leave, attendance and timesheet approvals were
 * routed by whatever the server had, not by what the screen showed.
 *
 * Only policies live here. A decision is taken through the owning module (leave requests,
 * attendance corrections), which is where the server decides whether the caller may approve.
 */

const base = (organizationId: string) => orgPath(organizationId, '/approval-policies');

export type ApprovalPolicyInput = {
  domain: string;
  code: string;
  name: string;
  isDefault?: boolean;
  steps: Array<
    Pick<ApprovalStep, 'stepNumber' | 'approverType'> &
      Partial<Pick<ApprovalStep, 'roleId' | 'approverUserId'>>
  >;
};

export const approvalsRepository = {
  async listPolicies(organizationId: string): Promise<ApprovalPolicy[]> {
    return expectShape(
      parseApprovalPolicyList(await apiRequest(base(organizationId), { method: 'GET' })),
      'approval policy list',
    );
  },

  async createPolicy(organizationId: string, input: ApprovalPolicyInput): Promise<ApprovalPolicy> {
    return expectShape(
      parseApprovalPolicy(await apiRequest(base(organizationId), { method: 'POST', body: input })),
      'approval policy',
    );
  },

  async updatePolicy(
    organizationId: string,
    policyId: string,
    input: Partial<ApprovalPolicyInput>,
  ): Promise<ApprovalPolicy> {
    return expectShape(
      parseApprovalPolicy(
        await apiRequest(`${base(organizationId)}/${policyId}`, { method: 'PATCH', body: input }),
      ),
      'approval policy',
    );
  },

  /** Retires a policy. The backend requires a reason and records it in the audit trail. */
  async deactivatePolicy(
    organizationId: string,
    policyId: string,
    reason: string,
  ): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/${policyId}/deactivate`, {
      method: 'POST',
      body: { reason },
    });
  },
};
