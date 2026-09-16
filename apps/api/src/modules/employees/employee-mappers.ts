import { ConflictError } from '../../common/errors/domain-error';

export function toEmployeeDto(value: {
  id: string;
  organizationId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  workEmail: string | null;
  personalEmail?: string | null;
  phone?: string | null;
  identitySource: string;
  externalId: string | null;
  status: string;
  employmentType: string;
  primaryBranchId: string | null;
  version: number;
}) {
  return {
    id: value.id,
    organizationId: value.organizationId,
    employeeNumber: value.employeeNumber,
    firstName: value.firstName,
    middleName: value.middleName,
    lastName: value.lastName,
    preferredName: value.preferredName,
    workEmail: value.workEmail,
    personalEmail: value.personalEmail,
    phone: value.phone,
    identitySource: value.identitySource,
    externalId: value.externalId,
    status: value.status,
    employmentType: value.employmentType,
    primaryBranchId: value.primaryBranchId,
    version: value.version,
  };
}

export function dateOnly(value: string) {
  const dateValue = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new ConflictError('Invalid calendar date');
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  )
    throw new ConflictError('Invalid calendar date');
  return date;
}
