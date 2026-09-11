import {
  parseBranchList,
  parseEmployee,
  parseEmployeeDetail,
  parseEmployeeDirectory,
  parseEmployeeList,
  parseEmploymentRecordList,
  parseStatutoryProfileList,
  parseProjectList,
  parseTeamList,
  type Branch,
  type Employee,
  type EmployeeDetail,
  type EmployeeDirectoryEntry,
  type EmploymentRecord,
  type StatutoryProfile,
  type Project,
  type Team,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

/**
 * Workforce data access: employees, teams, projects and branches.
 *
 * Every method is tenant-scoped by the `organizationId` in the path. That value comes from the
 * authenticated session, never from user input — and the API independently rejects a path
 * organization that does not match the session, so a tampered value fails server-side too.
 *
 * Responses are validated against the shared contract. A shape mismatch raises an error rather
 * than letting `undefined` render through the UI, and there is no fixture fallback: a failed
 * request stays failed.
 */

export const workforceRepository = {
  /**
   * The native employee read model: employment dates, job title, department and the reporting
   * line. Separate from `getEmployee` because that returns the shared DTO the federation contract
   * depends on, which deliberately omits these fields.
   */
  async getEmployeeDetail(organizationId: string, employeeId: string): Promise<EmployeeDetail> {
    return expectShape(
      parseEmployeeDetail(
        await apiRequest(
          `${orgPath(organizationId, '/employees')}/${encodeURIComponent(employeeId)}/detail`,
          { method: 'GET' },
        ),
      ),
      'employee detail',
    );
  },

  /** Attaches an existing organization member's login to an employee record. */
  async linkEmployeeUser(
    organizationId: string,
    employeeId: string,
    userId: string,
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/employees')}/${encodeURIComponent(employeeId)}/user`,
      { method: 'POST', body: { userId } },
    );
  },

  /**
   * Creates the employee record. The first of the onboarding steps and the only mandatory one —
   * everything after it attaches to the id this returns.
   */
  async createEmployee(
    organizationId: string,
    input: {
      employeeNumber: string;
      firstName: string;
      lastName: string;
      middleName?: string;
      preferredName?: string;
      workEmail?: string;
      personalEmail?: string;
      phone?: string;
      employmentType: string;
      dateOfJoining?: string;
      primaryBranchId?: string;
    },
  ): Promise<Employee> {
    return expectShape(
      parseEmployee(
        await apiRequest(`${orgPath(organizationId)}/employees`, { method: 'POST', body: input }),
      ),
      'employee',
    );
  },

  /**
   * Records job title, department and the reporting line for a period.
   *
   * These live on the employment record rather than on the employee, which is why onboarding
   * writes one rather than patching the employee.
   */
  async addEmploymentRecord(
    organizationId: string,
    employeeId: string,
    input: {
      jobTitle?: string;
      department?: string;
      managerEmployeeId?: string;
      employmentType: string;
      status: string;
      effectiveFrom: string;
    },
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/employees')}/${encodeURIComponent(employeeId)}/employment-records`,
      { method: 'POST', body: input },
    );
  },

  /**
   * Sets `Employee.managerEmployeeId`, which is what approval routing resolves against. The
   * employment record above carries the same manager for history; this is the live pointer.
   */
  async assignManager(
    organizationId: string,
    employeeId: string,
    managerEmployeeId: string,
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/employees')}/${encodeURIComponent(employeeId)}/manager`,
      { method: 'PUT', body: { managerEmployeeId } },
    );
  },

  /**
   * The employee directory, followed across pages.
   *
   * The API caps a page at 200 and returns a cursor. Everything that consumes this — the manager
   * picker, the admin tables — wants the whole roll rather than a page, so the pages are followed
   * here instead of pushing paging into six screens.
   *
   * `MAX_PAGES` bounds it. Ten thousand employees is far past what these screens render usefully,
   * and following an unbounded cursor would only move the original problem into the browser.
   * `truncated` says so plainly rather than letting a short list read as the whole company.
   */
  async listEmployees(organizationId: string): Promise<Employee[]> {
    return (await this.listEmployeePages(organizationId)).employees;
  },

  async listEmployeePages(
    organizationId: string,
  ): Promise<{ employees: Employee[]; truncated: boolean }> {
    const MAX_PAGES = 50;
    const employees: Employee[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const payload = await apiRequest(`${orgPath(organizationId)}/employees?${query}`, {
        method: 'GET',
      });
      employees.push(...expectShape(parseEmployeeList(payload), 'employee list'));
      cursor = readCursor(payload);
      if (!cursor) return { employees, truncated: false };
    }
    return { employees, truncated: true };
  },

  /**
   * The directory projection: reporting line, job title and department for many people at once.
   *
   * Separate from `listEmployees`, which returns the federation-shaped record and carries none of
   * those. Building a department grouping or an org chart from that one would take a detail
   * request per employee.
   */
  async listDirectory(
    organizationId: string,
  ): Promise<{ entries: EmployeeDirectoryEntry[]; truncated: boolean }> {
    const MAX_PAGES = 50;
    const entries: EmployeeDirectoryEntry[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: '200' });
      if (cursor) query.set('cursor', cursor);
      const payload = await apiRequest(`${orgPath(organizationId)}/employees/directory?${query}`, {
        method: 'GET',
      });
      entries.push(...expectShape(parseEmployeeDirectory(payload), 'employee directory'));
      cursor = readCursor(payload);
      if (!cursor) return { entries, truncated: false };
    }
    return { entries, truncated: true };
  },

  async getEmployee(organizationId: string, employeeId: string): Promise<Employee> {
    return expectShape(
      parseEmployee(
        await apiRequest(`${orgPath(organizationId)}/employees/${encodeURIComponent(employeeId)}`, {
          method: 'GET',
        }),
      ),
      'employee',
    );
  },

  /** Updates an employee. Requires `employees.write`; the API rejects externally-owned fields. */
  async updateEmployee(
    organizationId: string,
    employeeId: string,
    /** The employee's current `version`; the API rejects a stale one with 409. */
    version: number,
    input: Partial<{
      firstName: string;
      lastName: string;
      preferredName: string;
      workEmail: string;
      personalEmail: string;
      phone: string;
    }>,
  ): Promise<Employee> {
    return expectShape(
      parseEmployee(
        await apiRequest(`${orgPath(organizationId)}/employees/${encodeURIComponent(employeeId)}`, {
          method: 'PATCH',
          body: { ...input },
          headers: { 'if-match-version': String(version) },
        }),
      ),
      'employee',
    );
  },

  /** Employment history — the only source of jobTitle, department and joining date. */
  async listEmploymentRecords(
    organizationId: string,
    employeeId: string,
  ): Promise<EmploymentRecord[]> {
    return expectShape(
      parseEmploymentRecordList(
        await apiRequest(
          `${orgPath(organizationId)}/employees/${encodeURIComponent(employeeId)}/employment-records`,
          { method: 'GET' },
        ),
      ),
      'employment record list',
    );
  },

  /**
   * Statutory scheme enrolments. Requires `payroll.compliance.read`, which is a different
   * permission from `employees.read` — an employee viewer may not be a compliance viewer.
   */
  async listStatutoryProfiles(
    organizationId: string,
    employeeId: string,
  ): Promise<StatutoryProfile[]> {
    return expectShape(
      parseStatutoryProfileList(
        await apiRequest(
          `${orgPath(organizationId)}/compliance/employees/${encodeURIComponent(employeeId)}/profiles`,
          { method: 'GET' },
        ),
      ),
      'statutory profile list',
    );
  },

  async listTeams(organizationId: string): Promise<Team[]> {
    return expectShape(
      parseTeamList(await apiRequest(`${orgPath(organizationId)}/teams`, { method: 'GET' })),
      'team list',
    );
  },

  async listProjects(organizationId: string): Promise<Project[]> {
    return expectShape(
      parseProjectList(await apiRequest(`${orgPath(organizationId)}/projects`, { method: 'GET' })),
      'project list',
    );
  },

  async listBranches(organizationId: string): Promise<Branch[]> {
    return expectShape(
      parseBranchList(await apiRequest(`${orgPath(organizationId)}/branches`, { method: 'GET' })),
      'branch list',
    );
  },
};

export type AddTeamMemberInput = { employeeId: string; joinedAt: string };

export type AddProjectMemberInput = {
  employeeId: string;
  projectRole?: string;
  allocationPercentage?: number;
  startsOn: string;
  endsOn?: string;
};

/**
 * Membership mutations.
 *
 * Removal is a soft end-date, never a delete: the API sets `leftAt` / `endsOn` so historical
 * membership and allocation stay queryable. Ending an already-ended membership returns 409
 * rather than succeeding silently.
 */
export const membershipRepository = {
  addTeamMember(organizationId: string, teamId: string, input: AddTeamMemberInput) {
    return apiRequest(`${orgPath(organizationId)}/teams/${encodeURIComponent(teamId)}/members`, {
      method: 'POST',
      body: { ...input },
    });
  },

  addProjectMember(organizationId: string, projectId: string, input: AddProjectMemberInput) {
    return apiRequest(
      `${orgPath(organizationId)}/projects/${encodeURIComponent(projectId)}/members`,
      {
        method: 'POST',
        body: { ...input },
      },
    );
  },

  /** Soft-closes a team membership. `leftAt` must not precede the join date. */
  endTeamMember(organizationId: string, teamId: string, memberId: string, leftAt: string) {
    return apiRequest(
      `${orgPath(organizationId)}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}/end`,
      { method: 'POST', body: { leftAt } },
    );
  },

  /** Soft-closes a project allocation. `endsOn` must not precede the start date. */
  endProjectMember(organizationId: string, projectId: string, memberId: string, endsOn: string) {
    return apiRequest(
      `${orgPath(organizationId)}/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}/end`,
      { method: 'POST', body: { endsOn } },
    );
  },
};

/** The paging cursor from a list envelope, ignored when the API answered with a bare array. */
function readCursor(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const cursor = (payload as { nextCursor?: unknown }).nextCursor;
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
}
