import { PayrollReadinessController } from './payroll-readiness.controller';
import { Module } from '@nestjs/common';
import { PayrollReportsController } from './payroll-reports.controller';
import { PayrollReportsService } from './payroll-reports.service';
import { PayrollRunReviewService } from './payroll-run-review.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollPolicyService } from './payroll-policy.service';
import { PayrollPolicyController } from './payroll-policy.controller';
import { PayrollRuleUpdatesProcessor } from './payroll-rule-updates.processor';
import { PayrollRuleUpdatesService } from './payroll-rule-updates.service';
import { QueueModule } from '../../infrastructure/queue/queue.module';
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
  imports: [QueueModule],
  controllers: [
    PayrollReadinessController,
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
    PayrollRuleUpdatesService,
    PayrollRuleUpdatesProcessor,
  ],
})
export class PayrollModule {}
