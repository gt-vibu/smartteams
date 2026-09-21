import { Module } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { FilesController } from './files.controller';
import { FileLifecycleProcessor } from './file-lifecycle.processor';
import { FilesService } from './files.service';
import { FilesAccessService } from './files-access.service';
import { FilesUploadService } from './files-upload.service';
import { FilesDocumentsService } from './files-documents.service';
import { FilesSharesService } from './files-shares.service';
import { FilesDocumentsController } from './files-documents.controller';
@Module({
  // Documents first: its fixed `documents/...` paths must win over `:fileId` routes.
  controllers: [FilesDocumentsController, FilesController],
  exports: [FilesService],
  imports: [QueueModule],
  providers: [
    FilesService,
    FileLifecycleProcessor,
    FilesAccessService,
    FilesUploadService,
    FilesDocumentsService,
    FilesSharesService,
  ],
})
export class FilesModule {}
