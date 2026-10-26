import { EmployeeOperationsService } from './employee-operations.service';
import { EmployeeOperationsController } from './employee-operations.controller';
import { ShiftsModule } from '../shifts/shifts.module';
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
import { EmployeeImportController } from './employee-import.controller';
import { EmployeeImportService } from './employee-import.service';
import { EmployeeResignationsController } from './employee-resignations.controller';
import { EmployeeResignationsService } from './employee-resignations.service';
import { EmployeeResignationsProcessor } from './employee-resignations.processor';
import { EmployeeExtrasController } from './employee-extras.controller';
import { EmployeeCustomFieldsService } from './employee-custom-fields.service';
import { EmployeeMilestonesService } from './employee-milestones.service';

@Module({
  controllers: [
    EmployeeOperationsController,
    EmployeesController,
    DepartmentsController,
    EmployeeBranchesController,
    EmployeeImportController,
    EmployeeResignationsController,
    EmployeeExtrasController,
  ],
  imports: [ShiftsModule, AuthModule, QueueModule],
  providers: [
    EmployeeOperationsService,
    EmployeesService,
    EmployeeRecordsService,
    EmployeeDetailService,
    EmployeeAccessCodeService,
    DepartmentsService,
    EmployeeBranchesService,
    EmployeeBranchTransferProcessor,
    EmployeeImportService,
    EmployeeResignationsService,
    EmployeeResignationsProcessor,
    EmployeeCustomFieldsService,
    EmployeeMilestonesService,
  ],
  exports: [
    EmployeesService,
    EmployeeRecordsService,
    EmployeeDetailService,
    EmployeeAccessCodeService,
  ],
})
export class EmployeesModule {}
