import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalDelegationsController } from './approval-delegations.controller';
import { ApprovalDelegationsService } from './approval-delegations.service';
import { ApprovalFollowUpService } from './approval-follow-up.service';
import { ApproverSearchService } from './approver-search.service';
import { ApprovalExistingAutomationService } from './approval-existing-automation.service';
import { ApprovalAutomationPreviewService } from './approval-automation-preview.service';

@Module({
  imports: [AuthModule],
  controllers: [ApprovalsController, ApprovalDelegationsController],
  exports: [ApprovalsService],
  providers: [
    ApprovalsService,
    ApprovalDelegationsService,
    ApprovalFollowUpService,
    ApproverSearchService,
    ApprovalExistingAutomationService,
    ApprovalAutomationPreviewService,
  ],
})
export class ApprovalsModule {}
