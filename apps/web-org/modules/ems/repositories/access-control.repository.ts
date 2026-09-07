import {
  parseMemberList,
  parseRoleList,
  type OrganizationMember,
  type RoleWithPermissions,
} from '@smarteam/contracts';
import { ApiError, apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

/**
 * Organization access control: members, roles, and the grants between them.
 *
 * Every call here reaches a route that already existed and already enforced its own
 * authorization server-side — `RbacAdminService` and `MembersService`. This repository adds no
 * capability the API did not already have; it gives the frontend a typed, validated way to reach
 * it.
 */
export const accessControlRepository = {
  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    return expectShape(
      parseMemberList(await apiRequest(orgPath(organizationId, '/members'), { method: 'GET' })),
      'member list',
    );
  },

  async listRoles(organizationId: string): Promise<RoleWithPermissions[]> {
    return expectShape(
      parseRoleList(await apiRequest(orgPath(organizationId, '/roles'), { method: 'GET' })),
      'role list',
    );
  },

  async createRole(
    organizationId: string,
    input: { code: string; name: string; permissionKeys: string[] },
  ): Promise<void> {
    await apiRequest(orgPath(organizationId, '/roles'), {
      method: 'POST',
      body: { ...input, scope: 'ORGANIZATION' },
    });
  },

  async assignRole(organizationId: string, userId: string, roleId: string): Promise<void> {
    await apiRequest(orgPath(organizationId, '/role-assignments'), {
      method: 'POST',
      body: { userId, roleId },
    });
  },

  async revokeRole(organizationId: string, userRoleId: string): Promise<void> {
    await apiRequest(
      orgPath(organizationId, `/role-assignments/${encodeURIComponent(userRoleId)}`),
      {
        method: 'DELETE',
      },
    );
  },

  /**
   * Creates an employee record and links it to the signed-in user.
   *
   * Two existing calls, in order, with no new endpoint: `POST /employees` creates the record and
   * `POST /employees/:id/user` attaches it to a login. `userId` is the caller's own, taken from
   * the session — it is never accepted from a form, so this cannot be used to attach an employee
   * record to somebody else.
   *
   * Safe to retry. The link step returns the existing employee unchanged when it is already
   * attached to this same user, and refuses outright when the record belongs to a different one.
   */
  async enrollSelfAsEmployee(
    organizationId: string,
    userId: string,
    input: {
      employeeNumber: string;
      firstName: string;
      lastName: string;
      employmentType: string;
      workEmail?: string;
      dateOfJoining?: string;
    },
  ): Promise<void> {
    // Typed nullable on purpose: the response is unvalidated JSON, so the guard below is a real
    // runtime check rather than a formality the compiler can prove away.
    const created = (await apiRequest(orgPath(organizationId, '/employees'), {
      method: 'POST',
      body: { ...input },
    })) as { id?: string } | null;
    if (!created?.id) throw new ApiError('The employee response was not valid.', 502);
    await apiRequest(orgPath(organizationId, `/employees/${encodeURIComponent(created.id)}/user`), {
      method: 'POST',
      body: { userId },
    });
  },

  async addMember(
    organizationId: string,
    input: { email: string; displayName: string; roleIds: string[]; reason: string },
  ): Promise<{ temporaryPassword: string | null }> {
    return apiRequest(orgPath(organizationId, '/members'), {
      method: 'POST',
      body: input,
    }) as Promise<{
      temporaryPassword: string | null;
    }>;
  },
};
