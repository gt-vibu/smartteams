import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { LeaveAccrualService } from './leave-accrual.service';
import { LeaveAccrualProcessor } from './leave-accrual.processor';
import { LeaveCalendarService } from './leave-calendar.service';
import { LeaveExtrasController } from './leave-extras.controller';
import { LeaveCompOffService } from './leave-comp-off.service';
import { LeaveEncashmentService } from './leave-encashment.service';

@Module({
  imports: [QueueModule],
  controllers: [LeaveController, LeaveExtrasController],
  exports: [LeaveService],
  providers: [
    LeaveService,
    LeaveAccrualService,
    LeaveAccrualProcessor,
    LeaveCalendarService,
    LeaveCompOffService,
    LeaveEncashmentService,
  ],
})
export class LeaveModule {}
