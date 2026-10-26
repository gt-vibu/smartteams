import type { Prisma } from '../../generated/prisma/client';

export type EffectiveHolidayOptions = {
  organizationId: string;
  branchId?: string | null;
  employeeId?: string | null;
  start: Date;
  end: Date;
};

/**
 * Resolves the effective holiday dates (as YYYY-MM-DD strings) applicable to an employee.
 *
 * Effective Holidays = Applicable Mandatory Holidays (isOptional: false)
 *                    + Confirmed Employee-Selected Optional Holidays (isOptional: true)
 *
 * Optional holidays that have not been selected by the given employee are NOT included.
 * If no employeeId is supplied, only mandatory holidays are returned.
 */
export async function getEffectiveHolidayDates(
  tx: Prisma.TransactionClient,
  options: EffectiveHolidayOptions,
): Promise<Set<string>> {
  const { organizationId, branchId, employeeId, start, end } = options;

  // 1. Fetch mandatory active holidays for this organization and branch scope
  const mandatoryHolidays = await tx.holiday.findMany({
    where: {
      organizationId,
      isActive: true,
      isOptional: false,
      holidayDate: { gte: start, lte: end },
      ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : { branchId: null }),
    },
    select: { holidayDate: true },
  });

  const holidayDateSet = new Set(
    mandatoryHolidays.map((h) => h.holidayDate.toISOString().slice(0, 10)),
  );

  // 2. If employeeId is provided, fetch their active confirmed optional holiday selections
  if (employeeId) {
    const selectedOptionalHolidays = await tx.employeeHolidaySelection.findMany({
      where: {
        organizationId,
        employeeId,
        status: 'CONFIRMED',
        holiday: {
          isActive: true,
          isOptional: true,
          holidayDate: { gte: start, lte: end },
        },
      },
      include: {
        holiday: {
          select: { holidayDate: true },
        },
      },
    });

    for (const selection of selectedOptionalHolidays) {
      holidayDateSet.add(selection.holiday.holidayDate.toISOString().slice(0, 10));
    }
  }

  return holidayDateSet;
}
