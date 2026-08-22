import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationAuthService } from './federation-auth.service';
import { FederationAttendanceController } from './federation-attendance.controller';
import { FederationControllerSupport } from './federation-controller-support';
import { FederationEmployeesController } from './federation-employees.controller';
import { FederationInfrastructureController } from './federation-infrastructure.controller';
import { FederationLeaveController } from './federation-leave.controller';
import { FederationPayrollController } from './federation-payroll.controller';
import { FederationShiftsController } from './federation-shifts.controller';
import { FederationTimesheetsController } from './federation-timesheets.controller';
import { FederationComplianceController } from './federation-compliance.controller';
import { FederatedEmployeeService } from './federated-employee.service';
import { FederationGrantService } from './federation-grant.service';
import { FederationIdempotencyService } from './federation-idempotency.service';
import { OutboxService } from './outbox.service';
import { WebhookService } from './webhook.service';
import { WebhookProcessor } from './webhook.processor';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { OutboxDispatchProcessor } from './outbox-dispatch.processor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveModule } from '../leave/leave.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PayrollModule } from '../payroll/payroll.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { TimesheetsModule } from '../timesheets/timesheets.module';
import { HealthModule } from '../../common/health/health.module';
import { ComplianceModule } from '../compliance/compliance.module';

@Global()
@Module({
  controllers: [
    FederationInfrastructureController,
    FederationEmployeesController,
    FederationAttendanceController,
    FederationLeaveController,
    FederationPayrollController,
    FederationShiftsController,
    FederationTimesheetsController,
    FederationComplianceController,
  ],
  exports: [
    FederationAuthService,
    FederationAuthGuard,
    FederationGrantService,
    FederationIdempotencyService,
    OutboxService,
    WebhookService,
  ],
  imports: [
    QueueModule,
    MetricsModule,
    AttendanceModule,
    EmployeesModule,
    LeaveModule,
    OrganizationsModule,
    PayrollModule,
    ShiftsModule,
    TimesheetsModule,
    ComplianceModule,
    HealthModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ||
          config.getOrThrow<string>('FEDERATION_BOOTSTRAP_SECRET'),
        issuer: config.getOrThrow<string>('JWT_ISSUER'),
        audience: config.getOrThrow<string>('JWT_AUDIENCE'),
      }),
    }),
  ],
  providers: [
    FederationAuthGuard,
    FederationAuthService,
    FederationControllerSupport,
    FederationGrantService,
    FederationIdempotencyService,
    FederationIdempotencyInterceptor,
    FederationRateLimitInterceptor,
    OutboxService,
    WebhookService,
    WebhookProcessor,
    OutboxDispatchProcessor,
    FederatedEmployeeService,
  ],
})
export class FederationModule {}
