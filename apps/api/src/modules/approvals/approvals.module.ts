import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalDelegationsController } from './approval-delegations.controller';
import { ApprovalDelegationsService } from './approval-delegations.service';
import { ApprovalFollowUpService } from './approval-follow-up.service';
import { ApproverSearchService } from './approver-search.service';
import { ApprovalExistingAutomationService } from './approval-existing-automation.service';
import { ApprovalAutomationPreviewService } from './approval-automation-preview.service';
import { ApprovalOperationsController } from './approval-operations.controller';
import { ApprovalOperationsService } from './approval-operations.service';
import { ApprovalAnalyticsService } from './approval-analytics.service';
import { ApprovalBatchesController } from './approval-batches.controller';
import { ApprovalBatchesService } from './approval-batches.service';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: 'approval-batches' })],
  controllers: [
    ApprovalsController,
    ApprovalDelegationsController,
    ApprovalOperationsController,
    ApprovalBatchesController,
  ],
  exports: [ApprovalsService],
  providers: [
    ApprovalsService,
    ApprovalDelegationsService,
    ApprovalFollowUpService,
    ApproverSearchService,
    ApprovalExistingAutomationService,
    ApprovalAutomationPreviewService,
    ApprovalOperationsService,
    ApprovalAnalyticsService,
    ApprovalBatchesService,
  ],
})
export class ApprovalsModule {}
