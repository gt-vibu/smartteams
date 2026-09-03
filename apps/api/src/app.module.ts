import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from './common/config/config.module';
import { CommonModule } from './common/common.module';
import { RequestContextMiddleware } from './common/context/request-context';
import { CsrfMiddleware } from './common/security/csrf.middleware';
import { SecurityHeadersMiddleware } from './common/security/security-headers.middleware';
import { RequestRateLimitInterceptor } from './common/security/request-rate-limit.interceptor';
import { HealthModule } from './common/health/health.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FilesModule } from './modules/files/files.module';
import { FederationModule } from './modules/federation/federation.module';
import { LeaveModule } from './modules/leave/leave.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { HolidaysModule } from './modules/holidays/holidays.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>('LOG_LEVEL'),
          // pino-http's default serializer logs the whole header set, which would write every
          // bearer token and session cookie to the application log. Remove them outright
          // rather than masking, along with any credential that reaches a request body.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.token',
              'req.body.refreshToken',
              'req.body.clientSecret',
              'req.body.temporaryPassword',
            ],
            remove: true,
          },
        },
      }),
    }),
    AppConfigModule,
    CommonModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    StorageModule,
    HealthModule,
    MetricsModule,
    AuthModule,
    RbacModule,
    OrganizationsModule,
    UsersModule,
    EmployeesModule,
    FilesModule,
    AttendanceModule,
    ApprovalsModule,
    LeaveModule,
    TimesheetsModule,
    ShiftsModule,
    HolidaysModule,
    PayrollModule,
    FederationModule,
    AuditModule,
    PlatformModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RequestRateLimitInterceptor }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Order matters: headers and CSRF are enforced before any handler runs, and the request
    // context must exist before anything that reports a correlation id.
    consumer
      .apply(SecurityHeadersMiddleware, RequestContextMiddleware, CsrfMiddleware)
      .forRoutes('*');
  }
}
