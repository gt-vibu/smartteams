import type { Prisma } from '../../generated/prisma/client';
import { ConflictError } from '../../common/errors/domain-error';

export async function findTeamRetry(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { id?: string; name: string; description?: string; branchId?: string; teamLeadEmployeeId?: string; memberEmployeeIds?: string[] },
) {
  if (!input.id) return null;
  const existing = await tx.team.findFirst({
    where: { id: input.id, organizationId },
    include: { members: { where: { leftAt: null }, select: { employeeId: true } } },
  });
  if (!existing) return null;
  const sameRequest = existing.name === input.name.trim() &&
    existing.description === (input.description ?? null) &&
    existing.branchId === (input.branchId ?? null) &&
    existing.teamLeadEmployeeId === (input.teamLeadEmployeeId ?? null) &&
    sameIds(existing.members.map((member) => member.employeeId), input.memberEmployeeIds ?? []);
  if (!sameRequest) throw new ConflictError('This team creation was already submitted with different details. Refresh the team list before trying again.');
  return existing;
}

export async function findProjectRetry(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: { id?: string; code?: string; name: string; description?: string; branchId?: string; startDate?: string; endDate?: string; projectLeadEmployeeId?: string; members?: Array<{ employeeId: string; projectRole?: string }> },
) {
  if (!input.id) return null;
  const existing = await tx.project.findFirst({
    where: { id: input.id, organizationId },
    include: { members: { where: { endsOn: null }, select: { employeeId: true, projectRole: true } } },
  });
  if (!existing) return null;
  const requestedMembers = (input.members ?? []).map((member) => ({
    employeeId: member.employeeId, projectRole: member.projectRole?.trim().toLocaleLowerCase() ?? null,
  }));
  const existingMembers = existing.members.map((member) => ({
    employeeId: member.employeeId, projectRole: member.projectRole?.trim().toLocaleLowerCase() ?? null,
  }));
  const sameRequest = existing.name === input.name.trim() &&
    existing.description === (input.description ?? null) &&
    existing.branchId === (input.branchId ?? null) &&
    existing.projectLeadEmployeeId === (input.projectLeadEmployeeId ?? null) &&
    existing.startDate?.toISOString().slice(0, 10) === input.startDate &&
    existing.endDate?.toISOString().slice(0, 10) === input.endDate &&
    (!input.code || existing.code === input.code.trim().toUpperCase()) &&
    sameProjectMembers(existingMembers, requestedMembers);
  if (!sameRequest) throw new ConflictError('This project creation was already submitted with different details. Refresh the project list before trying again.');
  return existing;
}

function sameIds(left: readonly string[], right: readonly string[]) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function sameProjectMembers(
  left: Array<{ employeeId: string; projectRole: string | null }>,
  right: Array<{ employeeId: string; projectRole: string | null }>,
) {
  const sort = (members: typeof left) => [...members].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  return JSON.stringify(sort(left)) === JSON.stringify(sort(right));
}
