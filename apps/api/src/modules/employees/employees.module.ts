import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { EmployeeRecordsService } from './employee-records.service';
import { EmployeeDetailService } from './employee-detail.service';
import { EmployeeAccessCodeService } from './employee-access-code.service';

@Module({
  controllers: [EmployeesController],
  imports: [AuthModule],
  providers: [
    EmployeesService,
    EmployeeRecordsService,
    EmployeeDetailService,
    EmployeeAccessCodeService,
  ],
  exports: [
    EmployeesService,
    EmployeeRecordsService,
    EmployeeDetailService,
    EmployeeAccessCodeService,
  ],
})
export class EmployeesModule {}
