import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  controllers: [ApprovalsController],
  exports: [ApprovalsService],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
