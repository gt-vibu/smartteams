import { Injectable } from '@nestjs/common';
import {
  leaveCancellationSchema,
  leaveWorkflowSettingsSchema,
  type LeaveWorkflowSettings,
} from '@smarteam/contracts';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { notify, requesterRouting } from '../notifications/notify';
import { LeaveDecisionsService } from './leave-decisions.service';
import { workflowSettings } from './leave-workflow-rules';

@Injectable()
export class LeaveWorkflowsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  settings(context: DomainContext) {
    requirePermission(context, 'leave.requests.read');
    return this.database.run(context, async (tx) =>
      workflowSettings(
        (
          await tx.organizationSettings.findUnique({
            where: { organizationId: context.organizationId },
          })
        )?.metadata,
      ),
    );
  }

  saveSettings(context: DomainContext, input: LeaveWorkflowSettings) {
    requirePermission(context, 'leave.types.write');
    const rules = leaveWorkflowSettingsSchema.parse(input);
    return this.database.run(context, async (tx) => {
      await tx.$queryRaw`SELECT organization_id FROM organization_settings WHERE organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
      });
      const before = workflowSettings(settings.metadata);
      const metadata =
        settings.metadata &&
        typeof settings.metadata === 'object' &&
        !Array.isArray(settings.metadata)
          ? settings.metadata
          : {};
      await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: { metadata: jsonSnapshot({ ...metadata, leaveWorkflow: rules }) },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'LEAVE_WORKFLOW_SETTINGS_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(rules),
        },
        tx,
      );
      return rules;
    });
  }

  inbox(context: DomainContext, cursor?: string) {
    requirePermission(context, 'leave.requests.decide');
    requirePermission(context, 'leave.requests.read.all');
    return this.database.run(context, async (tx) => {
      const requests = await tx.leaveRequest.findMany({
        where: {
          organizationId: context.organizationId,
          sourceAccessMode: 'NATIVE',
          status: 'APPROVED',
          cancellation: { path: ['status'], equals: 'PENDING' },
        },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        take: 101,
        include: {
          employee: { select: { firstName: true, lastName: true, userId: true } },
          leaveType: { select: { name: true } },
        },
      });
      return {
        items: requests
          .slice(0, 100)
          .filter((item) => item.employee.userId !== context.actor.userId)
          .map((item) => ({
            id: item.id,
            name: `${item.employee.firstName} ${item.employee.lastName}`,
            leaveType: item.leaveType.name,
            startDate: item.startDate,
            endDate: item.endDate,
            cancellation: leaveCancellationSchema.parse(item.cancellation),
          })),
        nextCursor: requests.length > 100 ? requests[99]!.id : null,
      };
    });
  }

  decideCancellation(
    context: DomainContext,
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    requirePermission(context, 'leave.requests.decide');
    requirePermission(context, 'leave.requests.read.all');
    requirePermission(context, 'leave.requests.write');
    if (status === 'REJECTED' && (reason?.trim().length ?? 0) < 3)
      throw new ConflictError('Explain why the cancellation is rejected.');
    return this.database.run(context, async (tx) => {
      await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const request = await tx.leaveRequest.findFirst({
        where: { id, organizationId: context.organizationId, sourceAccessMode: 'NATIVE' },
        include: { employee: { select: { userId: true } } },
      });
      if (!request || request.status !== 'APPROVED')
        throw new NotFoundError('Approved leave cancellation');
      const cancellation = leaveCancellationSchema.safeParse(request.cancellation);
      if (!cancellation.success || cancellation.data.status !== 'PENDING')
        throw new ConflictError('This cancellation has already changed. Refresh the request.');
      if (
        !context.actor.userId ||
        cancellation.data.requestedByUserId === context.actor.userId ||
        request.employee.userId === context.actor.userId
      )
        throw new ConflictError('You cannot review your own cancellation.');
      const decision = {
        ...cancellation.data,
        status,
        reviewedAt: new Date().toISOString(),
        reviewedByUserId: context.actor.userId,
        reviewReason: reason?.trim(),
      };
      await tx.leaveRequest.update({
        where: { id },
        data: { cancellation: jsonSnapshot(decision), version: { increment: 1 } },
      });
      if (status === 'APPROVED')
        await new LeaveDecisionsService(this.database, this.audit).cancelInTransaction(
          tx,
          context,
          id,
          cancellation.data.reason,
          true,
        );
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_REQUEST',
          entityId: id,
          action: `LEAVE_CANCELLATION_${status}`,
          beforeState: jsonSnapshot(cancellation.data),
          afterState: jsonSnapshot(decision),
          reason: reason ?? cancellation.data.reason,
        },
        tx,
      );
      const employee = await requesterRouting(tx, context.organizationId, request.employeeId);
      await notify(tx, context, {
        recipients: [employee.userId],
        kind: 'LEAVE_CANCELLATION_DECIDED',
        title:
          status === 'APPROVED' ? 'Leave cancellation approved' : 'Leave cancellation rejected',
        body: reason?.trim() || 'Your cancellation request has been reviewed.',
        module: 'time-off',
        entityType: 'LEAVE_REQUEST',
        entityId: id,
      });
      return {
        id,
        cancellation: decision,
        status: status === 'APPROVED' ? 'CANCELLED' : 'APPROVED',
      };
    });
  }
}
