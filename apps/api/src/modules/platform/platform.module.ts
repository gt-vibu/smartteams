import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { TeamsProjectsService } from './teams-projects.service';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformAdminController } from './platform-admin.controller';

@Module({
  controllers: [PlatformController, PlatformAdminController],
  exports: [TeamsProjectsService, PlatformService],
  providers: [TeamsProjectsService, PlatformService, PlatformAuthGuard],
})
export class PlatformModule {}
