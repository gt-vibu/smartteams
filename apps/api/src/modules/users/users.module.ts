import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { RbacAdminService } from './rbac-admin.service';
import { MembersService } from './members.service';

@Module({
  controllers: [UsersController],
  exports: [MembersService, RbacAdminService],
  providers: [MembersService, RbacAdminService],
})
export class UsersModule {}
