import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Global()
@Module({
  exports: [StorageService],
  providers: [StorageService],
})
export class StorageModule {}
