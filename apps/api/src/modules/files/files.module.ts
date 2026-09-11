import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { FilesController } from './files.controller';
import { FileLifecycleProcessor } from './file-lifecycle.processor';
import { FilesService } from './files.service';
@Module({
  controllers: [FilesController],
  exports: [FilesService],
  imports: [QueueModule],
  providers: [FilesService, FileLifecycleProcessor],
})
export class FilesModule {}
