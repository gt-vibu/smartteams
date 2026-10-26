import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

const DAY_MS = 86_400_000;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

/**
 * Who is off, and when — the calendar a team plans around.
 *
 * Someone who reads all leave sees everyone. Anyone else sees the people they work with: their
 * teams (as member or lead), their manager, the people who report to them, and themselves. The
 * reason for a colleague's leave is never shown, and the type only to those who manage it or to
 * the person themselves: "on leave" is what a colleague needs to know.
 */
@Injectable()
export class LeaveCalendarService {
  constructor(private readonly database: TenantDatabaseService) {}

  calendar(context: DomainContext, fromText: string, toText: string) {
    requirePermission(context, 'leave.requests.read');
    const from = dateOnly(fromText);
    const to = dateOnly(toText);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from)
      throw new ConflictError('Choose a start date on or before the end date.');
    if (to.getTime() - from.getTime() > 92 * DAY_MS)
      throw new ConflictError('Show at most three months at a time.');
    const readsAll =
      context.permissions.has('*') || context.permissions.has('leave.requests.read.all');

    return this.database.run(context, async (tx) => {
      const organizationId = context.organizationId;
      const self = context.actor.userId
        ? await tx.employee.findFirst({
            where: { organizationId, userId: context.actor.userId },
            select: { id: true, managerEmployeeId: true },
          })
        : null;
      let scope: string[] | null = null;
      const reportIds = new Set<string>();
      if (!readsAll) {
        if (!self) return { entries: [] };
        const [teams, led, reports] = await Promise.all([
          tx.teamMember.findMany({
            where: { organizationId, employeeId: self.id, leftAt: null },
            select: { teamId: true },
          }),
          tx.team.findMany({
            where: { organizationId, teamLeadEmployeeId: self.id, status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.employee.findMany({
            where: { organizationId, managerEmployeeId: self.id, status: 'ACTIVE' },
            select: { id: true },
          }),
        ]);
        const teamIds = [...teams.map((row) => row.teamId), ...led.map((row) => row.id)];
        const [mates, leads] = teamIds.length
          ? await Promise.all([
              tx.teamMember.findMany({
                where: { organizationId, teamId: { in: teamIds }, leftAt: null },
                select: { employeeId: true },
              }),
              tx.team.findMany({
                where: { organizationId, id: { in: teamIds } },
                select: { teamLeadEmployeeId: true },
              }),
            ])
          : [[], []];
        reports.forEach((row) => reportIds.add(row.id));
        scope = [
          self.id,
          ...(self.managerEmployeeId ? [self.managerEmployeeId] : []),
          ...reportIds,
          ...mates.map((row) => row.employeeId),
          ...leads.flatMap((row) => (row.teamLeadEmployeeId ? [row.teamLeadEmployeeId] : [])),
        ];
      }

      const requests = await tx.leaveRequest.findMany({
        where: {
          organizationId,
          status: { in: ['APPROVED', 'PENDING'] },
          startDate: { lte: to },
          endDate: { gte: from },
          ...(scope ? { employeeId: { in: [...new Set(scope)] } } : {}),
          employee: { status: 'ACTIVE' },
        },
        orderBy: [{ startDate: 'asc' }, { employeeId: 'asc' }],
        take: 2000,
        select: {
          id: true,
          employeeId: true,
          startDate: true,
          endDate: true,
          requestedDays: true,
          status: true,
          leaveType: { select: { name: true } },
          employee: {
            select: { firstName: true, lastName: true, preferredName: true, employeeNumber: true },
          },
        },
      });
      const acceptedOverlaps = requests.length
        ? await tx.attendanceLeaveOverlapReview.findMany({
            where: {
              organizationId,
              leaveRequestId: { in: requests.map((request) => request.id) },
              status: 'APPROVED',
              workDate: { gte: from, lte: to },
            },
            select: { leaveRequestId: true, workDate: true, leaveUnits: true },
          })
        : [];
      const workedDatesByRequest = new Map<string, Array<{ date: string; units: number }>>();
      for (const overlap of acceptedOverlaps) {
        const dates = workedDatesByRequest.get(overlap.leaveRequestId) ?? [];
        dates.push({
          date: overlap.workDate.toISOString().slice(0, 10),
          units: Number(overlap.leaveUnits),
        });
        workedDatesByRequest.set(overlap.leaveRequestId, dates);
      }
      return {
        entries: requests.map((request) => {
          const seesType =
            readsAll || request.employeeId === self?.id || reportIds.has(request.employeeId);
          const workedDates = workedDatesByRequest.get(request.id) ?? [];
          return {
            id: request.id,
            employeeId: request.employeeId,
            name:
              request.employee.preferredName?.trim() ||
              `${request.employee.firstName} ${request.employee.lastName}`.trim(),
            employeeNumber: request.employee.employeeNumber,
            startDate: request.startDate.toISOString().slice(0, 10),
            endDate: request.endDate.toISOString().slice(0, 10),
            days: Math.max(
              0,
              Number(request.requestedDays) -
                workedDates.reduce((sum, item) => sum + item.units, 0),
            ),
            workedDates: workedDates.map((item) => item.date),
            status: request.status,
            type: seesType ? request.leaveType.name : null,
            isYou: request.employeeId === self?.id,
          };
        }),
      };
    });
  }
}
