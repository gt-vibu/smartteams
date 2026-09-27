import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalDelegationsController } from './approval-delegations.controller';
import { ApprovalDelegationsService } from './approval-delegations.service';
import { ApprovalFollowUpService } from './approval-follow-up.service';

@Module({
  imports: [AuthModule],
  controllers: [ApprovalsController, ApprovalDelegationsController],
  exports: [ApprovalsService],
  providers: [ApprovalsService, ApprovalDelegationsService, ApprovalFollowUpService],
})
export class ApprovalsModule {}
