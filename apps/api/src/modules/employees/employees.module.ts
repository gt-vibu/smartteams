import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { EmployeeRecordsService } from './employee-records.service';
import { EmployeeDetailService } from './employee-detail.service';

@Module({
  controllers: [EmployeesController],
  imports: [AuthModule],
  providers: [EmployeesService, EmployeeRecordsService, EmployeeDetailService],
  exports: [EmployeesService, EmployeeRecordsService, EmployeeDetailService],
})
export class EmployeesModule {}
