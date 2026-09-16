import { Module } from '@nestjs/common';
import { WebauthnService } from './webauthn.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceLocationService } from './attendance-location.service';
import { AttendanceAutoCheckOutService } from './attendance-auto-checkout.service';
import { AttendanceAutoCheckOutProcessor } from './attendance-auto-checkout.processor';
import { QueueModule } from '../../infrastructure/queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [AttendanceController],
  exports: [AttendanceService, WebauthnService],
  providers: [
    AttendanceService,
    AttendanceLocationService,
    WebauthnService,
    AttendanceAutoCheckOutService,
    AttendanceAutoCheckOutProcessor,
  ],
})
export class AttendanceModule {}
