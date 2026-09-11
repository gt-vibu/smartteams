import { Module } from '@nestjs/common';
import { WebauthnService } from './webauthn.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceLocationService } from './attendance-location.service';

@Module({
  controllers: [AttendanceController],
  exports: [AttendanceService, WebauthnService],
  providers: [AttendanceService, AttendanceLocationService, WebauthnService],
})
export class AttendanceModule {}
