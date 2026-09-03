import { parseProject, parseTeam, type Project, type Team } from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

/**
 * Team and project writes.
 *
 * Reads live in `workforce.repository` alongside the other list endpoints; the writes are here
 * so neither file has to carry both halves. Every path is tenant-scoped by the organization id
 * from the session, and the API re-checks that against the session independently.
 *
 * There is no delete. Teams and projects are archived, and membership is end-dated, because the
 * backend models both as soft closes and the history is not recoverable once discarded.
 */

export type CreateTeamInput = {
  name: string;
  description?: string;
  branchId?: string;
  teamLeadEmployeeId?: string;
};

export type CreateProjectInput = {
  code: string;
  name: string;
  description?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
};

export const teamsProjectsRepository = {
  async createTeam(organizationId: string, input: CreateTeamInput): Promise<Team> {
    return expectShape(
      parseTeam(
        await apiRequest(`${orgPath(organizationId)}/teams`, { method: 'POST', body: input }),
      ),
      'created team',
    );
  },

  async updateTeam(
    organizationId: string,
    teamId: string,
    input: Partial<CreateTeamInput>,
  ): Promise<Team> {
    return expectShape(
      parseTeam(
        await apiRequest(`${orgPath(organizationId)}/teams/${encodeURIComponent(teamId)}`, {
          method: 'PATCH',
          body: input,
        }),
      ),
      'updated team',
    );
  },

  /** Archives a team. The API requires a reason and records it in the audit trail. */
  async archiveTeam(organizationId: string, teamId: string, reason: string): Promise<void> {
    await apiRequest(`${orgPath(organizationId)}/teams/${encodeURIComponent(teamId)}/archive`, {
      method: 'POST',
      body: { reason },
    });
  },

  async createProject(organizationId: string, input: CreateProjectInput): Promise<Project> {
    return expectShape(
      parseProject(
        await apiRequest(`${orgPath(organizationId)}/projects`, { method: 'POST', body: input }),
      ),
      'created project',
    );
  },

  async updateProject(
    organizationId: string,
    projectId: string,
    input: Partial<CreateProjectInput> & { status?: string },
  ): Promise<Project> {
    return expectShape(
      parseProject(
        await apiRequest(`${orgPath(organizationId)}/projects/${encodeURIComponent(projectId)}`, {
          method: 'PATCH',
          body: input,
        }),
      ),
      'updated project',
    );
  },

  async archiveProject(organizationId: string, projectId: string, reason: string): Promise<void> {
    await apiRequest(
      `${orgPath(organizationId)}/projects/${encodeURIComponent(projectId)}/archive`,
      { method: 'POST', body: { reason } },
    );
  },
};
