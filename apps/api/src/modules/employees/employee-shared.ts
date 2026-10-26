import type { Prisma } from '../../generated/prisma/client';
import type { OwnerSource } from '../../generated/prisma/enums';
import { type DomainContext } from '../../common/context/domain-context';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { createHash } from 'node:crypto';

/**
 * Employee facts that more than one write path needs.
 *
 * `endOpenPrimaryAssignments` and `setOwnership` are called from both the native and the
 * federated write paths. Left as private methods on whichever service kept them, the other would
 * have had to depend on that service — which is how the original 877-line file stayed one file.
 */

export const externallyOwnedFields = new Set([
  'employeeNumber',
  'firstName',
  'middleName',
  'lastName',
  'preferredName',
  'workEmail',
  'personalEmail',
  'phone',
  'status',
  'employmentType',
  'dateOfJoining',
  'dateOfLeaving',
  'managerEmployeeId',
  'primaryBranchId',
]);

export async function endOpenPrimaryAssignments(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
  replacementStartsOn: Date,
  close: boolean | undefined,
) {
  if (!close) return;
  const boundary = new Date(replacementStartsOn);
  boundary.setUTCDate(boundary.getUTCDate() - 1);
  const openPrimary = await tx.employeeBranchAssignment.findMany({
    where: {
      organizationId,
      employeeId,
      isPrimary: true,
      endsOn: null,
    },
  });
  for (const assignment of openPrimary) {
    await tx.employeeBranchAssignment.update({
      where: { id: assignment.id },
      data: {
        endsOn: assignment.startsOn >= boundary ? assignment.startsOn : boundary,
        isPrimary: false,
      },
    });
  }
}

export async function setOwnership(
  tx: Parameters<Parameters<TenantDatabaseService['run']>[1]>[0],
  context: DomainContext,
  employeeId: string,
  fields: string[],
  ownerSource: OwnerSource,
  ownerClientId?: string,
  externalVersion?: string,
) {
  for (const fieldName of fields) {
    await tx.employeeFieldOwnership.upsert({
      where: { employeeId_fieldName: { employeeId, fieldName } },
      create: {
        employeeId,
        organizationId: context.organizationId,
        fieldName,
        ownerSource,
        ownerClientId,
        lastExternalVersion: externalVersion,
      },
      update: { ownerSource, ownerClientId, lastExternalVersion: externalVersion },
    });
  }
}

export function federatedEmail(clientId: string, externalId: string) {
  const suffix = createHash('sha256')
    .update(`${clientId}:${externalId}`)
    .digest('hex')
    .slice(0, 24);
  return `federated-${suffix}@invalid.smarteam.local`;
}
