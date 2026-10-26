import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { ForbiddenDomainError } from '../../common/errors/domain-error';
import type { AccessViewer } from './files-access-policy';

/**
 * Everything about the caller the file policy needs, read from the database for this request.
 *
 * Nothing comes from the client: not the employee, not the roles, not the teams. Roles and team
 * membership are read as they are now, so removing someone from a team or a role takes their
 * access away on their next request.
 */
export async function loadFileViewer(
  tx: Prisma.TransactionClient,
  context: DomainContext,
): Promise<AccessViewer> {
  // Refused outright: an undefined user id in a filter below would match every row.
  const userId = context.actor.userId;
  if (!userId) throw new ForbiddenDomainError('Documents are available to signed-in users only');
  const now = new Date();
  const [employee, roles] = await Promise.all([
    tx.employee.findFirst({
      where: { organizationId: context.organizationId, userId },
      select: { id: true },
    }),
    tx.userRole.findMany({
      where: {
        organizationId: context.organizationId,
        userId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { roleId: true },
    }),
  ]);
  const [teams, ledTeams, reports, projects, ledProjects] = employee
    ? await Promise.all([
        tx.teamMember.findMany({
          where: { organizationId: context.organizationId, employeeId: employee.id, leftAt: null },
          select: { teamId: true },
        }),
        // A team lead sees the team's files even when not listed as a member of it.
        tx.team.findMany({
          where: { organizationId: context.organizationId, teamLeadEmployeeId: employee.id },
          select: { id: true },
        }),
        tx.employee.findMany({
          where: { organizationId: context.organizationId, managerEmployeeId: employee.id },
          select: { id: true },
        }),
        // Current project work only: an allocation that has ended no longer opens its files.
        tx.projectMember.findMany({
          where: {
            organizationId: context.organizationId,
            employeeId: employee.id,
            startsOn: { lte: now },
            OR: [{ endsOn: null }, { endsOn: { gte: startOfToday(now) } }],
          },
          select: { projectId: true },
        }),
        tx.project.findMany({
          where: { organizationId: context.organizationId, projectLeadEmployeeId: employee.id },
          select: { id: true },
        }),
      ])
    : [[], [], [], [], []];
  const ledProjectIds = new Set(ledProjects.map((project) => project.id));
  const ledTeamIds = new Set(ledTeams.map((team) => team.id));
  return {
    userId,
    employeeId: employee?.id ?? null,
    roleIds: new Set(roles.map((role) => role.roleId)),
    teamIds: new Set([...teams.map((team) => team.teamId), ...ledTeamIds]),
    ledTeamIds,
    reportIds: new Set(reports.map((report) => report.id)),
    // Leading a project is belonging to it too.
    projectIds: new Set([...projects.map((row) => row.projectId), ...ledProjectIds]),
    ledProjectIds,
    permissions: context.permissions,
  };
}

/** Midnight UTC of `now`'s date: allocation dates are calendar dates stored at UTC midnight. */
function startOfToday(now: Date) {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** Rows the viewer might reach, before the policy decides. Always tenant-scoped. */
export function candidateFilter(
  context: DomainContext,
  viewer: AccessViewer,
  now = new Date(),
): Prisma.FileObjectWhereInput {
  const liveShare = {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  const has = (permission: string) =>
    viewer.permissions.has(permission) || viewer.permissions.has('*');
  const reach: Prisma.FileObjectWhereInput[] = [
    { accessScope: 'ORGANIZATION' },
    { shares: { some: { ...liveShare, granteeUserId: viewer.userId } } },
  ];
  if (viewer.employeeId) reach.push({ employeeId: viewer.employeeId });
  if (viewer.roleIds.size)
    reach.push({ shares: { some: { ...liveShare, granteeRoleId: { in: [...viewer.roleIds] } } } });
  if (viewer.teamIds.size) {
    reach.push({ accessScope: 'TEAM', teamId: { in: [...viewer.teamIds] } });
    reach.push({ shares: { some: { ...liveShare, granteeTeamId: { in: [...viewer.teamIds] } } } });
  }
  if (viewer.projectIds?.size)
    reach.push({ accessScope: 'PROJECT', projectId: { in: [...viewer.projectIds] } });
  if (has('files.read.all'))
    reach.push({ accessScope: { in: ['EMPLOYEE', 'TEAM', 'PROJECT', 'INTERNAL'] } });
  if (has('files.reports.read') && viewer.reportIds.size)
    reach.push({ accessScope: 'EMPLOYEE', employeeId: { in: [...viewer.reportIds] } });
  if (!viewer.employeeId)
    reach.push({ accessScope: 'PERSONAL', employeeId: null, uploadedByUserId: viewer.userId });
  return {
    organizationId: context.organizationId,
    status: 'AVAILABLE',
    deletedAt: null,
    OR: reach,
  };
}
