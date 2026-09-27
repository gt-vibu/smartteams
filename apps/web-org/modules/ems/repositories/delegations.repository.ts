import { apiRequest } from '../lib/api-client';
import { orgPath } from './api-helpers';

export type Delegation = {
  id: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  delegator: { userId: string; name: string };
  delegate: { userId: string; name: string };
  status: 'ACTIVE' | 'UPCOMING' | 'ENDED';
};

export type DelegationCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  employeeNumber: string;
  status: string;
};

const base = (organizationId: string) => orgPath(organizationId, '/approval-delegations');

/** The caller's own handovers: the ones they gave, and the ones they are covering. */
export const delegationsRepository = {
  async list(organizationId: string) {
    return (await apiRequest(base(organizationId), { method: 'GET' })) as {
      given: Delegation[];
      received: Delegation[];
    };
  },
  async candidates(organizationId: string) {
    return (await apiRequest(`${base(organizationId)}/candidates`, {
      method: 'GET',
    })) as DelegationCandidate[];
  },
  async create(
    organizationId: string,
    input: { delegateEmployeeId: string; startsOn: string; endsOn: string; reason?: string },
  ) {
    return (await apiRequest(base(organizationId), { method: 'POST', body: input })) as Delegation;
  },
  async revoke(organizationId: string, delegationId: string) {
    await apiRequest(`${base(organizationId)}/${encodeURIComponent(delegationId)}/revoke`, {
      method: 'POST',
    });
  },
};
