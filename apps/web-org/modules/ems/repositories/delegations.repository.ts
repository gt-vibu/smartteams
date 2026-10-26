import { apiRequest } from '../lib/api-client';
import { orgPath } from './api-helpers';

export type Delegation = {
  id: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  delegator: { userId: string; name: string };
  delegate: { userId: string; name: string };
  /** Set up by an administrator; took effect without the colleague accepting. */
  setByAdministrator?: boolean;
  /** PENDING waits for the colleague to accept; DECLINED is their answer. */
  status: 'PENDING' | 'DECLINED' | 'ACTIVE' | 'UPCOMING' | 'ENDED';
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
      /** Everyone's, for an administrator. */
      all?: Delegation[];
      canSetForOthers?: boolean;
    };
  },
  async candidates(organizationId: string) {
    return (await apiRequest(`${base(organizationId)}/candidates`, {
      method: 'GET',
    })) as DelegationCandidate[];
  },
  async create(
    organizationId: string,
    input: {
      delegateEmployeeId: string;
      /** Administrators only: the person away. */
      delegatorEmployeeId?: string;
      startsOn: string;
      endsOn: string;
      reason?: string;
    },
  ) {
    return (await apiRequest(base(organizationId), { method: 'POST', body: input })) as Delegation;
  },
  /** The colleague asked to cover answers. */
  async respond(organizationId: string, delegationId: string, accept: boolean) {
    await apiRequest(
      `${base(organizationId)}/${encodeURIComponent(delegationId)}/${accept ? 'accept' : 'decline'}`,
      { method: 'POST' },
    );
  },
  async revoke(organizationId: string, delegationId: string) {
    await apiRequest(`${base(organizationId)}/${encodeURIComponent(delegationId)}/revoke`, {
      method: 'POST',
    });
  },
};
