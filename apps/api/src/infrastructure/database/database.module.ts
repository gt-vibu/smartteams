import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDatabaseService } from './tenant-database.service';
import { RlsEnforcementGuard } from './rls-enforcement.guard';

@Global()
@Module({
  exports: [PrismaService, TenantDatabaseService],
  providers: [PrismaService, TenantDatabaseService, RlsEnforcementGuard],
})
export class DatabaseModule {}
