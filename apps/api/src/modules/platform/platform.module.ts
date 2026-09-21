import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { MembershipService } from './membership.service';
import { TeamsProjectsService } from './teams-projects.service';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformAdminController } from './platform-admin.controller';
import { FederationGrantAdminService } from './federation-grant-admin.service';
import { PicklistsController } from './picklists.controller';
import { PicklistsService } from './picklists.service';

@Module({
  controllers: [PlatformController, PlatformAdminController, PicklistsController],
  exports: [TeamsProjectsService, MembershipService, PlatformService],
  providers: [
    TeamsProjectsService,
    MembershipService,
    PlatformService,
    PlatformAuthGuard,
    FederationGrantAdminService,
    PicklistsService,
  ],
})
export class PlatformModule {}
