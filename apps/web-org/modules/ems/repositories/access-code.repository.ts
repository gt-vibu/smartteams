import {
  parseAccessCodePreview,
  parseAccessCodeStatus,
  type AccessCodePreview,
  type EmployeeAccessCodeStatus,
  type IssuedAccessCode,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

/**
 * Employee access codes: the administrator half and the employee half.
 *
 * The two halves are deliberately different shapes. The administrator's calls are organization
 * scoped and authorized like everything else; the employee's are not authorized at all, because
 * the whole point is that they have no account yet — the code is what establishes who they are.
 */
export const accessCodeRepository = {
  /** Whether this employee can sign in yet, and how far along they are if not. */
  async status(organizationId: string, employeeId: string): Promise<EmployeeAccessCodeStatus> {
    return expectShape(
      parseAccessCodeStatus(
        await apiRequest(
          orgPath(organizationId, `/employees/${encodeURIComponent(employeeId)}/access-code`),
          {
            method: 'GET',
          },
        ),
      ),
      'access code status',
    );
  },

  /**
   * Issues a code, returning the plaintext.
   *
   * This is the only response that will ever contain it — the server keeps a digest — so a
   * caller that discards this value cannot recover the code, only issue a new one.
   */
  async issue(
    organizationId: string,
    employeeId: string,
    roleIds: string[] = [],
  ): Promise<IssuedAccessCode> {
    return apiRequest(
      orgPath(organizationId, `/employees/${encodeURIComponent(employeeId)}/access-code`),
      {
        method: 'POST',
        body: { roleIds },
      },
    ) as Promise<IssuedAccessCode>;
  },

  async revoke(organizationId: string, employeeId: string): Promise<void> {
    await apiRequest(
      orgPath(organizationId, `/employees/${encodeURIComponent(employeeId)}/access-code`),
      {
        method: 'DELETE',
      },
    );
  },

  /** Employee side: confirm the code and see whose it is, before committing to a password. */
  async preview(code: string): Promise<AccessCodePreview> {
    return expectShape(
      parseAccessCodePreview(
        await apiRequest('/v1/auth/activation/preview', { method: 'POST', body: { code } }),
      ),
      'access code preview',
    );
  },

  /** Employee side: redeem the code. The response establishes the session in cookies. */
  async activate(input: { code: string; email: string; password: string }): Promise<void> {
    await apiRequest('/v1/auth/activation/activate', { method: 'POST', body: input });
  },
};
