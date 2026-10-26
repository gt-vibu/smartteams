import type { Prisma } from '../../generated/prisma/client';

/** Every word may match a name, work email or employee-number field. */
export function employeeNameSearch(search?: string): Prisma.EmployeeWhereInput | undefined {
  const words = search?.trim().split(/\s+/).filter(Boolean);
  if (!words?.length) return undefined;
  return {
    AND: words.map((word) => ({
      OR: ['firstName', 'lastName', 'employeeNumber', 'workEmail'].map((field) => ({
        [field]: { contains: word, mode: 'insensitive' as const },
      })),
    })),
  };
}
