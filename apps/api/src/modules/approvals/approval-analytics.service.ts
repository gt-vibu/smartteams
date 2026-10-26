import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

@Injectable()
export class ApprovalAnalyticsService {
  constructor(private readonly database: TenantDatabaseService) {}

  get(context: DomainContext) {
    requirePermission(context, 'approval-policies.read');
    return this.database.run(context, async (tx) => {
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
        select: { approvalEscalationDays: true },
      });
      const escalationDays = settings?.approvalEscalationDays ?? 5;
      const now = new Date();
      const since = new Date(now.getTime() - 30 * 86400000);
      const cutoff = new Date(now.getTime() - escalationDays * 86400000);
      const scope = {
        organizationId: context.organizationId,
        ...(context.branchId ? { branchId: context.branchId } : {}),
      };
      const rows = [];
      if (context.permissions.has('*') || context.permissions.has('leave.requests.read.all')) {
        const where = { ...scope, status: 'PENDING' as const };
        const [pending, overdue, oldest, automatic, manual] = await Promise.all([
          tx.leaveRequest.count({ where }),
          escalationDays > 0
            ? tx.leaveRequest.count({ where: { ...where, createdAt: { lte: cutoff } } })
            : 0,
          tx.leaveRequest.findFirst({
            where,
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
          tx.leaveApproval.count({
            where: {
              organizationId: context.organizationId,
              leaveRequest: scope,
              createdAt: { gte: since },
              status: 'APPROVED',
              decisionActor: 'SYSTEM',
            },
          }),
          tx.leaveApproval.count({
            where: {
              organizationId: context.organizationId,
              leaveRequest: scope,
              createdAt: { gte: since },
              status: 'APPROVED',
              decisionActor: 'USER',
            },
          }),
        ]);
        rows.push({
          domain: 'LEAVE',
          pending,
          overdue,
          oldestAt: oldest?.createdAt.toISOString() ?? null,
          automatic,
          manual,
        });
      }
      if (context.permissions.has('*') || context.permissions.has('attendance.read.all')) {
        const correctionScope = {
          organizationId: context.organizationId,
          ...(context.branchId ? { attendanceRecord: { branchId: context.branchId } } : {}),
        };
        const where = { ...correctionScope, status: 'PENDING' as const };
        const [pending, overdue, oldest, automatic, manual] = await Promise.all([
          tx.attendanceCorrection.count({ where }),
          escalationDays > 0
            ? tx.attendanceCorrection.count({ where: { ...where, createdAt: { lte: cutoff } } })
            : 0,
          tx.attendanceCorrection.findFirst({
            where,
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
          tx.attendanceApproval.count({
            where: {
              organizationId: context.organizationId,
              attendanceCorrection: correctionScope,
              createdAt: { gte: since },
              status: 'APPROVED',
              decisionActor: 'SYSTEM',
            },
          }),
          tx.attendanceApproval.count({
            where: {
              organizationId: context.organizationId,
              attendanceCorrection: correctionScope,
              createdAt: { gte: since },
              status: 'APPROVED',
              decisionActor: 'USER',
            },
          }),
        ]);
        rows.push({
          domain: 'ATTENDANCE_CORRECTION',
          pending,
          overdue,
          oldestAt: oldest?.createdAt.toISOString() ?? null,
          automatic,
          manual,
        });
      }
      return { generatedAt: now.toISOString(), since: since.toISOString(), escalationDays, rows };
    });
  }
}
