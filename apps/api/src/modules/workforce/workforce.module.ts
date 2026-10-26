import { PayrollPolicySettingsService } from '../payroll/payroll-policy-settings.service';
import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveModule } from '../leave/leave.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { PayrollModule } from '../payroll/payroll.module';
import { WorkforceApplyService } from './workforce-apply.service';
import { WorkforceCatalogService } from './workforce-catalog.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceJobsProcessor } from './workforce-jobs.processor';
import { WorkforceJobsService } from './workforce-jobs.service';
import { WorkforcePlanService } from './workforce-plan.service';

@Module({
  imports: [AuthModule, EmployeesModule, LeaveModule, ShiftsModule, PayrollModule, QueueModule],
  controllers: [WorkforceController],
  providers: [
    PayrollPolicySettingsService,
    WorkforcePlanService,
    WorkforceApplyService,
    WorkforceJobsService,
    WorkforceJobsProcessor,
    WorkforceCatalogService,
  ],
})
export class WorkforceModule {}
