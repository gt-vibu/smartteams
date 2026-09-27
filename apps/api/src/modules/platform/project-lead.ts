import type { Prisma } from '../../generated/prisma/client';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';

/**
 * The employee a project is being led by: in this organization, and still employed. Someone who
 * has left cannot be put in charge of anything, the same rule that stops them being added to it.
 */
export async function assertProjectLead(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
) {
  const lead = await tx.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: { firstName: true, lastName: true, status: true },
  });
  if (!lead) throw new NotFoundError('Employee');
  if (lead.status !== 'ACTIVE')
    throw new ConflictError(
      `${lead.firstName} ${lead.lastName} is no longer active, so they cannot lead a project.`,
    );
}
