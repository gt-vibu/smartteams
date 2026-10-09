import type { Prisma } from '../../generated/prisma/client';
import { ConflictError } from '../../common/errors/domain-error';

/** The organization row is locked by the caller for the entire employee creation. */
export async function takeFederatedEmployeeNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  requestedPrefix = 'EMP',
): Promise<string> {
  const prefix = requestedPrefix.trim().toUpperCase();
  if (prefix.length > 16 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(prefix)) {
    throw new ConflictError('Use 1 to 16 letters, numbers, and hyphens for the employee prefix.');
  }

  // Include inactive and terminated employees: assigned numbers are never reused.
  for (;;) {
    const organization = await tx.organization.update({
      where: { id: organizationId },
      data: { employeeNumberSequence: { increment: 1 } },
      select: { employeeNumberSequence: true },
    });
    const number = `${prefix}-${String(organization.employeeNumberSequence).padStart(4, '0')}`;
    const taken = await tx.employee.findFirst({
      where: { organizationId, employeeNumber: number },
      select: { id: true },
    });
    if (!taken) return number;
  }
}
