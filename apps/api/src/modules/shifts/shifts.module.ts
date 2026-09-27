import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { ShiftAssignmentsService } from './shift-assignments.service';
import { ShiftRotationService } from './shift-rotation.service';

@Module({
  controllers: [ShiftsController],
  exports: [ShiftsService],
  providers: [ShiftsService, ShiftAssignmentsService, ShiftRotationService],
})
export class ShiftsModule {}
