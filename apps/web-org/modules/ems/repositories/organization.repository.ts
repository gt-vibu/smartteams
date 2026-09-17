import {
  branchSchema,
  parseBranchList,
  parseOrganization,
  type Branch,
  type Organization,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

/**
 * Organization and branch data access.
 *
 * Replaces `organization.json` plus four `localStorage` keys that held the organization profile,
 * its branches, its announcements and its quick links — none of which the server ever saw. An
 * administrator could rename the organization and see the new name until they cleared their
 * browser.
 *
 * Only what the backend models is here. Departments, announcements, milestones and the org chart
 * have no endpoint because they have no entity.
 */

export type OrganizationUpdate = {
  name?: string;
  timezone?: string;
  currencyCode?: string;
};

export type BranchInput = {
  name: string;
  code: string;
  externalId?: string;
  address?: Record<string, unknown>;
};

/** `workforce.ts` publishes the list parser; a single-row parse is derived from the same schema. */
function parseBranchRow(payload: unknown): Branch | null {
  const result = branchSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export const organizationRepository = {
  async get(organizationId: string): Promise<Organization> {
    return expectShape(
      parseOrganization(await apiRequest(orgPath(organizationId), { method: 'GET' })),
      'organization',
    );
  },

  /** Name, timezone and currency are the only fields the API accepts. */
  async update(organizationId: string, input: OrganizationUpdate): Promise<Organization> {
    return expectShape(
      parseOrganization(
        await apiRequest(orgPath(organizationId), { method: 'PATCH', body: input }),
      ),
      'organization',
    );
  },

  async listBranches(organizationId: string): Promise<Branch[]> {
    return expectShape(
      parseBranchList(await apiRequest(orgPath(organizationId, '/branches'), { method: 'GET' })),
      'branch list',
    );
  },

  async createBranch(organizationId: string, input: BranchInput): Promise<Branch> {
    return expectShape(
      parseBranchRow(
        await apiRequest(orgPath(organizationId, '/branches'), { method: 'POST', body: input }),
      ),
      'branch',
    );
  },

  async updateBranch(
    organizationId: string,
    branchId: string,
    input: Partial<BranchInput>,
  ): Promise<Branch> {
    return expectShape(
      parseBranchRow(
        await apiRequest(orgPath(organizationId, `/branches/${encodeURIComponent(branchId)}`), {
          method: 'PATCH',
          body: input,
        }),
      ),
      'branch',
    );
  },

  /** Retires a branch. The backend requires a reason and records it in the audit trail. */
  async deactivateBranch(
    organizationId: string,
    branchId: string,
    reason: string,
  ): Promise<unknown> {
    return apiRequest(
      orgPath(organizationId, `/branches/${encodeURIComponent(branchId)}/deactivate`),
      { method: 'POST', body: { reason } },
    );
  },
};
