import { Module } from '@nestjs/common';
import { PayrollReportsController } from './payroll-reports.controller';
import { PayrollReportsService } from './payroll-reports.service';
import { PayrollRunReviewService } from './payroll-run-review.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollPolicyService } from './payroll-policy.service';
import { PayrollPolicyController } from './payroll-policy.controller';
import { PayrollPreviewService } from './payroll-preview.service';
import {
  PayrollAdvanceRulesController,
  PayrollAdvanceRulesService,
} from './payroll-advance-rules.controller';
import {
  PayrollOvertimeRatesController,
  PayrollOvertimeRatesService,
} from './payroll-overtime-rates';

@Module({
  controllers: [
    PayrollController,
    PayrollPolicyController,
    PayrollOvertimeRatesController,
    PayrollAdvanceRulesController,
    PayrollReportsController,
  ],
  exports: [PayrollService, PayrollPolicyService, PayrollPreviewService],
  providers: [
    PayrollReportsService,
    PayrollRunReviewService,
    PayrollService,
    PayrollPolicyService,
    PayrollPreviewService,
    PayrollOvertimeRatesService,
    PayrollAdvanceRulesService,
  ],
})
export class PayrollModule {}
