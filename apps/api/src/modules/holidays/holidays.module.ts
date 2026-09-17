import { Module } from '@nestjs/common';
import { EmployeeHolidaysService } from './employee-holidays.service';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';

@Module({
  controllers: [HolidaysController],
  exports: [HolidaysService, EmployeeHolidaysService],
  providers: [HolidaysService, EmployeeHolidaysService],
})
export class HolidaysModule {}
