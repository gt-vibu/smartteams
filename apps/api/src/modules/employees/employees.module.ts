import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { EmployeeRecordsService } from './employee-records.service';

@Module({
  controllers: [EmployeesController],
  imports: [AuthModule],
  providers: [EmployeesService, EmployeeRecordsService],
  exports: [EmployeesService, EmployeeRecordsService],
})
export class EmployeesModule {}
