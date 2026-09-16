import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { ShiftAssignmentsService } from './shift-assignments.service';

@Module({
  controllers: [ShiftsController],
  exports: [ShiftsService],
  providers: [ShiftsService, ShiftAssignmentsService],
})
export class ShiftsModule {}
