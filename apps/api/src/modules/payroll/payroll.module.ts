import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollPolicyService } from './payroll-policy.service';
import { PayrollPolicyController } from './payroll-policy.controller';
import { PayrollPreviewService } from './payroll-preview.service';
import {
  PayrollOvertimeRatesController,
  PayrollOvertimeRatesService,
} from './payroll-overtime-rates';

@Module({
  controllers: [PayrollController, PayrollPolicyController, PayrollOvertimeRatesController],
  exports: [PayrollService, PayrollPolicyService, PayrollPreviewService],
  providers: [
    PayrollService,
    PayrollPolicyService,
    PayrollPreviewService,
    PayrollOvertimeRatesService,
  ],
})
export class PayrollModule {}
