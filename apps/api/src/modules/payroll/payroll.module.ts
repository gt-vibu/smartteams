import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollPolicyService } from './payroll-policy.service';
import { PayrollPolicyController } from './payroll-policy.controller';
import { PayrollPreviewService } from './payroll-preview.service';

@Module({
  controllers: [PayrollController, PayrollPolicyController],
  exports: [PayrollService, PayrollPolicyService, PayrollPreviewService],
  providers: [PayrollService, PayrollPolicyService, PayrollPreviewService],
})
export class PayrollModule {}
