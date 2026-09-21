import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client';
import { ConflictError } from '../../common/errors/domain-error';
import {
  encryptEmployeeSecret,
  fingerprintEmployeeSecret,
  isValidAadhaar,
  normalizeAadhaar,
} from './employee-sensitive-data';

type Tx = Prisma.TransactionClient;

/**
 * The rules that make an employee record identifiable: one employee number, one work email and
 * one Aadhaar number per person in an organization. Each is checked here with a message that
 * names the clash, and each is also held by a database index for requests that race.
 */

/** Company-wide series used when a new joiner's department has no series of its own. */
const DEFAULT_SERIES = 'EMP';

export function normalizeEmployeeNumber(value: string) {
  return value.trim().replace(/\s+/g, '');
}

/** `emp1` and `EMP1` are the same number to a person reading them, so they clash. */
export async function assertEmployeeNumberFree(
  tx: Tx,
  organizationId: string,
  employeeNumber: string,
  exceptEmployeeId?: string,
) {
  const clash = await tx.employee.findFirst({
    where: {
      organizationId,
      employeeNumber: { equals: employeeNumber, mode: 'insensitive' },
      ...(exceptEmployeeId ? { id: { not: exceptEmployeeId } } : {}),
    },
    select: { firstName: true, lastName: true, employeeNumber: true },
  });
  if (clash)
    throw new ConflictError(
      `Employee ID ${clash.employeeNumber} already belongs to ${clash.firstName} ${clash.lastName}.`,
    );
}

export function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

export async function assertWorkEmailFree(
  tx: Tx,
  organizationId: string,
  workEmail: string | null,
  exceptEmployeeId?: string,
) {
  if (!workEmail) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail))
    throw new ConflictError(`${workEmail} is not a valid email address.`);
  // Two saves of the same email at once would both pass the lookup below. Holding a lock on this
  // organization and email until the transaction ends makes the second wait, then see the first.
  // The unique index is the backstop, but it is absent where old duplicates stopped it being built.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${workEmail.toLowerCase()}`}, 0))`;
  const clash = await tx.employee.findFirst({
    where: {
      organizationId,
      workEmail: { equals: workEmail, mode: 'insensitive' },
      ...(exceptEmployeeId ? { id: { not: exceptEmployeeId } } : {}),
    },
    select: { firstName: true, lastName: true, employeeNumber: true },
  });
  if (clash)
    throw new ConflictError(
      `${workEmail} is already the work email of ${clash.firstName} ${clash.lastName} (${clash.employeeNumber}).`,
    );
}

/**
 * Refuses an email that already signs in to this organization, before any record is written.
 * Onboarding creates the employee and then the login; checking only at the login step left an
 * employee behind with no way to sign in whenever the address was taken.
 */
export async function assertLoginEmailFree(tx: Tx, organizationId: string, email: string | null) {
  if (!email) return;
  const member = await tx.userOrganization.findFirst({
    where: {
      organizationId,
      status: { not: 'REMOVED' },
      user: { email: { equals: email, mode: 'insensitive' } },
    },
    select: { userId: true },
  });
  if (member) throw new ConflictError(`${email} already has a login in this organization.`);
}

/**
 * The next number in the company-wide series (EMP001, EMP002 …). The organization's settings row
 * is locked for the transaction, so two joiners saved at once cannot both be given the same one.
 */
export async function nextOrganizationEmployeeNumber(tx: Tx, organizationId: string) {
  await tx.$queryRaw`SELECT organization_id FROM organization_settings WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  const rows = await tx.$queryRaw<Array<{ highest: number | null }>>`
    SELECT max(substring(employee_number FROM ${`^${DEFAULT_SERIES}(\\d+)$`})::int) AS highest
    FROM employees
    WHERE organization_id = ${organizationId}::uuid
      AND employee_number ~ ${`^${DEFAULT_SERIES}\\d+$`}`;
  const next = (rows[0]?.highest ?? 0) + 1;
  return `${DEFAULT_SERIES}${String(next).padStart(3, '0')}`;
}

/** Validates, de-duplicates and stores an Aadhaar number, encrypted, on the employee's profile. */
export async function saveAadhaar(
  tx: Tx,
  config: ConfigService,
  organizationId: string,
  employeeId: string,
  value: string,
) {
  const aadhaar = normalizeAadhaar(value);
  if (!isValidAadhaar(aadhaar)) throw new ConflictError('Enter a valid 12-digit Aadhaar number.');
  const hash = fingerprintEmployeeSecret(config, aadhaar);
  // Two people onboarded at the same moment with one Aadhaar would both pass the lookup below.
  // The lock makes the second wait for the first, so it sees it and refuses by name rather than
  // by the unique index, which reads as a database error and says nothing about who holds it.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`${organizationId}:aadhaar:${hash}`}, 0))`;
  const clash = await tx.employeePersonalProfile.findFirst({
    where: { organizationId, aadhaarNumberHash: hash, employeeId: { not: employeeId } },
    select: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
  });
  if (clash)
    throw new ConflictError(
      `This Aadhaar number is already recorded for ${clash.employee.firstName} ${clash.employee.lastName} (${clash.employee.employeeNumber}).`,
    );
  const data = {
    aadhaarNumberEncrypted: encryptEmployeeSecret(config, aadhaar),
    aadhaarNumberHash: hash,
  };
  await tx.employeePersonalProfile.upsert({
    where: { employeeId },
    create: { organizationId, employeeId, ...data },
    update: data,
  });
}
