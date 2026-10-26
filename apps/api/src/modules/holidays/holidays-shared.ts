import { ConflictError } from '../../common/errors/domain-error';

/** Matches the date handling the rest of the backend uses for `@db.Date` columns. */
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

export function toHolidayDto(holiday: {
  id: string;
  organizationId: string;
  branchId: string | null;
  holidayDate: Date;
  name: string;
  isOptional: boolean;
  isActive: boolean;
}) {
  const dayOfWeek = holiday.holidayDate.getUTCDay();
  const fallsOnWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  return {
    id: holiday.id,
    organizationId: holiday.organizationId,
    branchId: holiday.branchId,
    holidayDate: holiday.holidayDate.toISOString().slice(0, 10),
    name: holiday.name,
    isOptional: holiday.isOptional,
    isActive: holiday.isActive,
    fallsOnWeekend,
  };
}

export function toEmployeePolicyDto(policy: {
  id: string;
  organizationId: string;
  employeeId: string;
  allowanceOverride: number | null;
  restrictedHolidayIds: string[];
  createdAt: Date;
  updatedAt: Date;
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    workEmail: string | null;
  };
}) {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    employeeId: policy.employeeId,
    allowanceOverride: policy.allowanceOverride,
    restrictedHolidayIds: policy.restrictedHolidayIds,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
    employee: policy.employee,
  };
}
