import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { lateHalfDays, lateMarks } from './attendance-late';

const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

/** Late check-ins, and the organization's rule for what they cost. */
@Injectable()
export class AttendanceLateService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  marks(context: DomainContext, fromText: string, toText: string) {
    requirePermission(context, 'attendance.read');
    const from = dateOnly(fromText);
    const to = dateOnly(toText);
    if (to < from) throw new ConflictError('Choose a start date on or before the end date.');
    if (to.getTime() - from.getTime() > 92 * 86_400_000)
      throw new ConflictError('Show at most three months at a time.');
    const readsAll = context.permissions.has('*') || context.permissions.has('attendance.read.all');
    return this.database.run(context, async (tx) => {
      let employeeIds: string[] | undefined;
      if (!readsAll) {
        const self = await tx.employee.findFirst({
          where: { organizationId: context.organizationId, userId: context.actor.userId ?? '' },
          select: { id: true },
        });
        if (!self) return { rule: null, people: [] };
        employeeIds = [self.id];
      }
      const [marks, settings] = await Promise.all([
        lateMarks(tx, context.organizationId, { from, to, employeeIds }),
        tx.organizationSettings.findUnique({
          where: { organizationId: context.organizationId },
          select: { lateGraceMinutes: true, lateMarksPerHalfDay: true },
        }),
      ]);
      const byEmployee = new Map<string, typeof marks>();
      for (const mark of marks)
        byEmployee.set(mark.employeeId, [...(byEmployee.get(mark.employeeId) ?? []), mark]);
      const people = await tx.employee.findMany({
        where: { organizationId: context.organizationId, id: { in: [...byEmployee.keys()] } },
        select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      });
      const perHalfDay = settings?.lateMarksPerHalfDay ?? 0;
      return {
        rule: {
          graceMinutes: settings?.lateGraceMinutes ?? 0,
          marksPerHalfDay: perHalfDay,
        },
        people: people
          .map((person) => {
            const list = byEmployee.get(person.id) ?? [];
            return {
              employeeId: person.id,
              name: `${person.firstName} ${person.lastName}`.trim(),
              employeeNumber: person.employeeNumber,
              count: list.length,
              halfDaysDeducted: lateHalfDays(list.length, perHalfDay) / 2,
              days: list.map(({ date, minutesLate }) => ({ date, minutesLate })),
            };
          })
          .sort((a, b) => b.count - a.count),
      };
    });
  }

  rules(context: DomainContext) {
    requirePermission(context, 'attendance.preferences.read');
    return this.database.run(context, async (tx) => {
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
        select: { lateGraceMinutes: true, lateMarksPerHalfDay: true },
      });
      return {
        graceMinutes: settings?.lateGraceMinutes ?? 15,
        marksPerHalfDay: settings?.lateMarksPerHalfDay ?? 0,
      };
    });
  }

  setRules(context: DomainContext, input: { graceMinutes: number; marksPerHalfDay: number }) {
    requirePermission(context, 'attendance.preferences.write');
    return this.database.run(context, async (tx) => {
      const before = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: { lateGraceMinutes: true, lateMarksPerHalfDay: true },
      });
      const after = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: { lateGraceMinutes: input.graceMinutes, lateMarksPerHalfDay: input.marksPerHalfDay },
        select: { lateGraceMinutes: true, lateMarksPerHalfDay: true },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'LATE_RULES_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(after),
        },
        tx,
      );
      return { graceMinutes: after.lateGraceMinutes, marksPerHalfDay: after.lateMarksPerHalfDay };
    });
  }
}
