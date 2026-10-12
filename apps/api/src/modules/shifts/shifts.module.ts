import { Module } from '@nestjs/common';
import { ShiftAssignmentsService } from './shift-assignments.service';
import { ShiftRotationService } from './shift-rotation.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { WorkingDayService } from './working-day.service';

@Module({
  controllers: [ShiftsController],
  exports: [ShiftsService, WorkingDayService],
  providers: [ShiftsService, ShiftAssignmentsService, ShiftRotationService, WorkingDayService],
})
export class ShiftsModule {}
