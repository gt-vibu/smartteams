import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDatabaseService } from './tenant-database.service';

@Global()
@Module({
  exports: [PrismaService, TenantDatabaseService],
  providers: [PrismaService, TenantDatabaseService],
})
export class DatabaseModule {}
