import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';

@Module({
  exports: [RbacService],
  providers: [RbacService],
})
export class RbacModule {}
