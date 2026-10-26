import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

/** How long a request may wait before its approvers are reminded, and administrators told. */
@Injectable()
export class ApprovalFollowUpService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  get(context: DomainContext) {
    requirePermission(context, 'approval-policies.read');
    return this.database.run(context, async (tx) => {
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
        select: { approvalReminderDays: true, approvalEscalationDays: true },
      });
      return {
        reminderDays: settings?.approvalReminderDays ?? 2,
        escalationDays: settings?.approvalEscalationDays ?? 5,
      };
    });
  }

  set(context: DomainContext, input: { reminderDays: number; escalationDays: number }) {
    requirePermission(context, 'approval-policies.write');
    if (
      input.escalationDays > 0 &&
      input.reminderDays > 0 &&
      input.escalationDays < input.reminderDays
    )
      throw new ConflictError('Tell administrators no sooner than the first reminder.');
    return this.database.run(context, async (tx) => {
      const before = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: { approvalReminderDays: true, approvalEscalationDays: true },
      });
      const after = await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: {
          approvalReminderDays: input.reminderDays,
          approvalEscalationDays: input.escalationDays,
        },
        select: { approvalReminderDays: true, approvalEscalationDays: true },
      });
      await this.audit.record(
        context,
        {
          entityType: 'ORGANIZATION_SETTINGS',
          entityId: context.organizationId,
          action: 'APPROVAL_FOLLOW_UP_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(after),
        },
        tx,
      );
      return {
        reminderDays: after.approvalReminderDays,
        escalationDays: after.approvalEscalationDays,
      };
    });
  }
}
