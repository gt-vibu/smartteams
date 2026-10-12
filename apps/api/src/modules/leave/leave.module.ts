import { LeaveWorkflowsController } from './leave-workflows.controller';
import { LeaveWorkflowsService } from './leave-workflows.service';
import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { LeaveAccrualProcessor } from './leave-accrual.processor';
import { LeaveAccrualService } from './leave-accrual.service';
import { LeaveAttachmentsService } from './leave-attachments.service';
import { LeaveCalendarService } from './leave-calendar.service';
import { LeaveCompOffService } from './leave-comp-off.service';
import { LeaveEncashmentService } from './leave-encashment.service';
import { LeaveExtrasController } from './leave-extras.controller';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [QueueModule],
  controllers: [LeaveWorkflowsController, LeaveController, LeaveExtrasController],
  exports: [LeaveService],
  providers: [
    LeaveService,
    LeaveWorkflowsService,
    LeaveAttachmentsService,
    LeaveAccrualService,
    LeaveAccrualProcessor,
    LeaveCalendarService,
    LeaveCompOffService,
    LeaveEncashmentService,
  ],
})
export class LeaveModule {}
