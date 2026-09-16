import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { FilesService } from './files.service';

type FileLifecycleJob = { fileId: string; organizationId: string };

@Processor('file-lifecycle')
export class FileLifecycleProcessor extends WorkerHost {
  constructor(private readonly files: FilesService) {
    super();
  }
  async process(job: Job<FileLifecycleJob>) {
    await this.files.purgeDeleted(job.data.fileId, job.data.organizationId);
  }
}
