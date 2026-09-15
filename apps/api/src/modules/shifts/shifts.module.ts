import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { ShiftAssignmentLookupService } from './shift-assignment-lookup.service';

@Module({
  controllers: [ShiftsController],
  exports: [ShiftsService],
  providers: [ShiftsService, ShiftAssignmentLookupService],
})
export class ShiftsModule {}
