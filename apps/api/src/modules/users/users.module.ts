import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { RbacAdminService } from './rbac-admin.service';
import { MembersService } from './members.service';
import { RolePermissionsService } from './role-permissions.service';

@Module({
  controllers: [UsersController],
  exports: [MembersService, RbacAdminService],
  providers: [MembersService, RbacAdminService, RolePermissionsService],
})
export class UsersModule {}
