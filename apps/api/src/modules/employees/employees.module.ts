import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { EmployeeRecordsService } from './employee-records.service';
import { EmployeeDetailService } from './employee-detail.service';
import { EmployeeAccessCodeService } from './employee-access-code.service';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { EmployeeBranchesController } from './employee-branches.controller';
import { EmployeeBranchesService } from './employee-branches.service';
import { EmployeeBranchTransferProcessor } from './employee-branch-transfer.processor';

@Module({
  controllers: [EmployeesController, DepartmentsController, EmployeeBranchesController],
  imports: [AuthModule, QueueModule],
  providers: [
    EmployeesService,
    EmployeeRecordsService,
    EmployeeDetailService,
    EmployeeAccessCodeService,
    DepartmentsService,
    EmployeeBranchesService,
    EmployeeBranchTransferProcessor,
  ],
  exports: [
    EmployeesService,
    EmployeeRecordsService,
    EmployeeDetailService,
    EmployeeAccessCodeService,
  ],
})
export class EmployeesModule {}
