import { Module } from '@nestjs/common';
import { WebauthnService } from './webauthn.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceLocationService } from './attendance-location.service';
import { AttendanceAutoCheckOutService } from './attendance-auto-checkout.service';
import { AttendanceAutoCheckOutProcessor } from './attendance-auto-checkout.processor';
import { AttendanceWorkWeekController } from './attendance-work-week.controller';
import { AttendanceWorkWeekService } from './attendance-work-week.service';
import { QueueModule } from '../../infrastructure/queue/queue.module';

@Module({
  imports: [QueueModule],
  // Work week first: its fixed path must win over the attendance controller's `:id` routes.
  controllers: [AttendanceWorkWeekController, AttendanceController],
  exports: [AttendanceService, WebauthnService],
  providers: [
    AttendanceService,
    AttendanceLocationService,
    WebauthnService,
    AttendanceAutoCheckOutService,
    AttendanceAutoCheckOutProcessor,
    AttendanceWorkWeekService,
  ],
})
export class AttendanceModule {}
