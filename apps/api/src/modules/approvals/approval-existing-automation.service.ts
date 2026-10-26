import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AttendanceDecisionsService } from '../attendance/attendance-decisions.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { LeaveDecisionsService } from '../leave/leave-decisions.service';
import { systemApprovalContext, validateAutomation } from './approval-automation';
import { ApprovalAutomationPreviewService } from './approval-automation-preview.service';

@Injectable()
export class ApprovalExistingAutomationService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly preview: ApprovalAutomationPreviewService,
    private readonly audit: AuditService,
  ) {}

  async apply(
    context: DomainContext,
    input: {
      domain: string;
      automation: Record<string, unknown>;
      ids: string[];
      reason: string;
    },
  ) {
    requirePermission(context, 'approval-policies.write');
    requirePermission(
      context,
      input.domain === 'LEAVE' ? 'leave.requests.read.all' : 'attendance.read.all',
    );
    requirePermission(
      context,
      input.domain === 'LEAVE' ? 'leave.requests.decide' : 'attendance.corrections.decide',
    );
    if (
      context.accessMode !== 'NATIVE' ||
      !['LEAVE', 'ATTENDANCE_CORRECTION'].includes(input.domain)
    )
      throw new ConflictError(
        'Existing automation supports native leave and attendance corrections.',
      );
    validateAutomation(input.domain, input.automation);
    const results: Array<{ id: string; outcome: string; message: string }> = [];
    for (const id of input.ids) {
      try {
        await this.database.run(
          context,
          async (tx) => {
            if (input.domain === 'LEAVE')
              await tx.$queryRaw`SELECT id FROM leave_requests WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
            else
              await tx.$queryRaw`SELECT id FROM attendance_corrections WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
            const checked = await this.preview.evaluate(tx, context, { ...input, ids: [id] });
            if (!checked.examples.find((row) => row.id === id)?.eligible)
              throw new ConflictError('No longer eligible; retained for individual review.');
            const system = systemApprovalContext(context);
            const comment = 'Existing request approved by administrator-applied automation rules.';
            if (input.domain === 'LEAVE')
              await new LeaveDecisionsService(this.database, this.audit).decideInTransaction(
                tx,
                system,
                id,
                'APPROVED',
                comment,
              );
            else
              await new AttendanceDecisionsService(this.database, this.audit).decideInTransaction(
                tx,
                system,
                id,
                'APPROVED',
                comment,
              );
            await this.audit.record(
              context,
              {
                entityType: input.domain === 'LEAVE' ? 'LEAVE_REQUEST' : 'ATTENDANCE_CORRECTION',
                entityId: id,
                action: 'EXISTING_APPROVAL_RULES_APPLIED',
                reason: input.reason,
                afterState: jsonSnapshot({ automation: input.automation, status: 'APPROVED' }),
              },
              tx,
            );
          },
          { timeout: 30000 },
        );
        results.push({ id, outcome: 'APPROVED', message: 'Approved with the displayed rules.' });
      } catch (error) {
        results.push({
          id,
          outcome: 'SKIPPED',
          message: error instanceof Error ? error.message : 'Could not apply rules.',
        });
      }
    }
    return { results, approved: results.filter((row) => row.outcome === 'APPROVED').length };
  }
}
