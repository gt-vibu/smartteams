import type { Prisma } from '../../generated/prisma/client';
import { NotFoundError } from '../../common/errors/domain-error';

/**
 * Helpers both halves of the employee record services use.
 */

export async function assertEmployee(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
) {
  const employee = await tx.employee.findFirst({ where: { id: employeeId, organizationId } });
  if (!employee) throw new NotFoundError('Employee');
  return employee;
}

export function dateBefore(value: Date) {
  const previous = new Date(value);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}
