import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { RbacAdminService } from './rbac-admin.service';

@Module({
  controllers: [UsersController],
  exports: [RbacAdminService],
  providers: [RbacAdminService],
})
export class UsersModule {}
