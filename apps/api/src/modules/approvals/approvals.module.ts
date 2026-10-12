import { ApproverSearchService } from './approver-search.service';
import { ApprovalAnalyticsService } from './approval-analytics.service';
import { ApprovalExistingAutomationService } from './approval-existing-automation.service';
import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuthModule } from '../auth/auth.module';
import { LeaveModule } from '../leave/leave.module';
import { ApprovalAutomationPreviewService } from './approval-automation-preview.service';
import { ApprovalBatchesController } from './approval-batches.controller';
import { ApprovalBatchesProcessor } from './approval-batches.processor';
import { ApprovalBatchesService } from './approval-batches.service';
import { ApprovalDelegationsController } from './approval-delegations.controller';
import { ApprovalDelegationsService } from './approval-delegations.service';
import { ApprovalFollowUpService } from './approval-follow-up.service';
import { ApprovalOperationsController } from './approval-operations.controller';
import { ApprovalOperationsService } from './approval-operations.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [AuthModule, QueueModule, LeaveModule, AttendanceModule],
  controllers: [
    ApprovalsController,
    ApprovalDelegationsController,
    ApprovalBatchesController,
    ApprovalOperationsController,
  ],
  exports: [ApprovalsService],
  providers: [
    ApprovalAnalyticsService,
    ApproverSearchService,
    ApprovalExistingAutomationService,
    ApprovalsService,
    ApprovalOperationsService,
    ApprovalAutomationPreviewService,
    ApprovalDelegationsService,
    ApprovalFollowUpService,
    ApprovalBatchesService,
    ApprovalBatchesProcessor,
  ],
})
export class ApprovalsModule {}
