import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './common/config/config.module';
import { HealthModule } from './common/health/health.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FederationModule } from './modules/federation/federation.module';
import { LeaveModule } from './modules/leave/leave.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
    }),
    AppConfigModule,
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
    AttendanceModule,
    LeaveModule,
    TimesheetsModule,
    ShiftsModule,
    PayrollModule,
    FederationModule,
    AuditModule,
    PlatformModule,
  ],
})
export class AppModule {}
