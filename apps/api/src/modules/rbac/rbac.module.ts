import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';

@Global()
@Module({
  exports: [RbacService],
  providers: [RbacService],
})
export class RbacModule {}
