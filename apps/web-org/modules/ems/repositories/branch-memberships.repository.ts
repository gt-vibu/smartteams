import { parseBranchMemberships, type BranchMembership } from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

/**
 * An employee's branches. Every call answers with the whole history as it now stands, so the
 * screen never has to work out what a change did to the other rows.
 */
const base = (organizationId: string, employeeId: string) =>
  `${orgPath(organizationId)}/employees/${encodeURIComponent(employeeId)}/branches`;

const history = async (request: Promise<unknown>): Promise<BranchMembership[]> =>
  expectShape(parseBranchMemberships(await request), 'branch memberships');

export const branchMembershipsRepository = {
  list(organizationId: string, employeeId: string) {
    return history(apiRequest(base(organizationId, employeeId), { method: 'GET' }));
  },

  /** An additional branch, from a date and optionally until one. */
  add(
    organizationId: string,
    employeeId: string,
    input: { branchId: string; startsOn: string; endsOn?: string },
  ) {
    return history(apiRequest(base(organizationId, employeeId), { method: 'POST', body: input }));
  },

  /** Moves the primary branch from a date; the previous one ends the day before. */
  transfer(
    organizationId: string,
    employeeId: string,
    input: { branchId: string; effectiveFrom: string },
  ) {
    return history(
      apiRequest(`${base(organizationId, employeeId)}/transfer`, { method: 'POST', body: input }),
    );
  },

  end(organizationId: string, employeeId: string, membershipId: string, endsOn: string) {
    return history(
      apiRequest(`${base(organizationId, employeeId)}/${encodeURIComponent(membershipId)}/end`, {
        method: 'POST',
        body: { endsOn },
      }),
    );
  },

  /** Withdraws one that has not started; a cancelled transfer restores the previous primary. */
  cancel(organizationId: string, employeeId: string, membershipId: string) {
    return history(
      apiRequest(`${base(organizationId, employeeId)}/${encodeURIComponent(membershipId)}/cancel`, {
        method: 'POST',
      }),
    );
  },
};
