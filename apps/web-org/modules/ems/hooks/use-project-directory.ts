'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission, type Branch, type Employee, type Project } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { membershipRepository, workforceRepository } from '../repositories/workforce.repository';
import {
  teamsProjectsRepository,
  type CreateProjectInput,
} from '../repositories/teams-projects.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';
import { indexEmployees, toProjectView, type ProjectView } from '../services/team-directory';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Loaded = { projects: Project[]; employees: Employee[]; branches: Branch[] };

export type AddProjectMemberInput = {
  employeeId: string;
  projectRole?: string;
  allocationPercentage?: number;
};

/**
 * The project directory, assembled from the projects, employees and branch endpoints.
 *
 * Mirrors `useTeamDirectory`. Allocation is set when a member is added and cannot be changed
 * afterwards, because the API has no route to update a membership row — removing and re-adding
 * would rewrite history, so the field is read-only once saved.
 */
export function useProjectDirectory() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'projects.read');
  const canWrite = hasPermission(permissions, 'projects.write');
  const canReadEmployees = hasPermission(permissions, 'employees.read');

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [projects, employees, branches] = await Promise.all([
        workforceRepository.listProjects(organizationId!),
        canReadEmployees ? workforceRepository.listEmployees(organizationId!) : Promise.resolve([]),
        workforceRepository.listBranches(organizationId!).catch(() => [] as Branch[]),
      ]);
      return { projects, employees, branches };
    },
    [organizationId, canReadEmployees],
    { enabled: Boolean(organizationId) && canRead },
  );

  const { saving, saveError, run } = useMutationRunner(resource.refetch);

  const views: ProjectView[] = useMemo(() => {
    if (!resource.data) return [];
    const employees = indexEmployees(resource.data.employees);
    return resource.data.projects.map((project) =>
      toProjectView(project, employees, resource.data!.branches),
    );
  }, [resource.data]);

  const myProjects = useMemo(
    () =>
      employeeId
        ? views.filter((view) =>
            view.activeMembers.some((member) => member.employeeId === employeeId),
          )
        : [],
    [views, employeeId],
  );

  const createProject = useCallback(
    (input: CreateProjectInput, members: readonly AddProjectMemberInput[]) =>
      run(async () => {
        const project = await teamsProjectsRepository.createProject(organizationId!, input);
        for (const member of members) {
          await membershipRepository.addProjectMember(organizationId!, project.id, {
            employeeId: member.employeeId,
            ...(member.projectRole ? { projectRole: member.projectRole } : {}),
            ...(member.allocationPercentage !== undefined
              ? { allocationPercentage: member.allocationPercentage }
              : {}),
            startsOn: input.startDate ?? today(),
          });
        }
        return project;
      }, 'The project could not be created.'),
    [organizationId, run],
  );

  const addMember = useCallback(
    (projectId: string, member: AddProjectMemberInput) =>
      run(
        () =>
          membershipRepository.addProjectMember(organizationId!, projectId, {
            employeeId: member.employeeId,
            ...(member.projectRole ? { projectRole: member.projectRole } : {}),
            ...(member.allocationPercentage !== undefined
              ? { allocationPercentage: member.allocationPercentage }
              : {}),
            startsOn: today(),
          }),
        'The allocation could not be saved.',
      ),
    [organizationId, run],
  );

  /** Ends an allocation. The row is kept with an end date; nothing is deleted. */
  const endMember = useCallback(
    (projectId: string, memberId: string) =>
      run(
        () => membershipRepository.endProjectMember(organizationId!, projectId, memberId, today()),
        'The allocation could not be ended.',
      ),
    [organizationId, run],
  );

  const archiveProject = useCallback(
    (projectId: string, reason: string) =>
      run(
        () => teamsProjectsRepository.archiveProject(organizationId!, projectId, reason),
        'The project could not be archived.',
      ),
    [organizationId, run],
  );

  return {
    projects: views,
    myProjects,
    employees: resource.data?.employees ?? [],
    branches: resource.data?.branches ?? [],
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    refetch: resource.refetch,
    saving,
    saveError,
    createProject,
    addMember,
    endMember,
    archiveProject,
    canRead,
    canWrite,
  };
}

export type ProjectDirectoryState = ReturnType<typeof useProjectDirectory>;
