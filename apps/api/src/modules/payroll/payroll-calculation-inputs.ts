import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
export function loadPayrollCalculationInputs(
  tx: Prisma.TransactionClient,
  context: DomainContext,
  run: { periodStart: Date; periodEnd: Date },
) {
  return Promise.all([
    tx.employee.findMany({
      where: { organizationId: context.organizationId, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      include: {
        employmentRecords: {
          where: {
            effectiveFrom: { lte: run.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        shifts: {
          where: {
            startsOn: { lte: run.periodEnd },
            OR: [{ endsOn: null }, { endsOn: { gte: run.periodStart } }],
            shift: { isActive: true },
          },
          orderBy: { startsOn: 'desc' },
          include: { shift: true },
        },
        compensations: {
          where: {
            effectiveFrom: { lte: run.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        payrollPolicies: {
          where: {
            effectiveFrom: { lte: run.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          include: {
            payrollPolicy: {
              include: { components: { include: { payComponent: true } } },
            },
          },
        },
        payComponents: {
          where: {
            effectiveFrom: { lte: run.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
          },
          include: { payComponent: true },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    }),
    tx.organizationSettings.findUniqueOrThrow({
      where: { organizationId: context.organizationId },
    }),
    tx.holiday.findMany({
      where: {
        organizationId: context.organizationId,
        isActive: true,
        holidayDate: { gte: run.periodStart, lte: run.periodEnd },
      },
      select: { holidayDate: true, branchId: true, isOptional: true },
    }),
    tx.employeeHolidaySelection.findMany({
      where: {
        organizationId: context.organizationId,
        status: 'CONFIRMED',
        holiday: {
          isActive: true,
          isOptional: true,
          holidayDate: { gte: run.periodStart, lte: run.periodEnd },
        },
      },
      select: {
        employeeId: true,
        holiday: { select: { holidayDate: true } },
      },
    }),
    tx.leaveRequest.findMany({
      where: {
        organizationId: context.organizationId,
        status: 'APPROVED',
        startDate: { lte: run.periodEnd },
        endDate: { gte: run.periodStart },
      },
      select: {
        employeeId: true,
        branchId: true,
        startDate: true,
        endDate: true,
        requestedDays: true,
        session: true,
        chargedDates: true,
        leaveType: { select: { paid: true } },
      },
    }),
    tx.attendanceRecord.findMany({
      where: {
        organizationId: context.organizationId,
        workDate: { gte: run.periodStart, lte: run.periodEnd },
      },
      select: {
        employeeId: true,
        workDate: true,
        dayStatus: true,
        workedMinutes: true,
        scheduledMinutes: true,
        overtimeMinutes: true,
        overtimeDayType: true,
      },
    }),
  ]);
}
