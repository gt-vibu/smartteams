import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { FilePurpose } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { FilesAccessService } from './files-access.service';
import { FilesUploadService } from './files-upload.service';

export { toFileDto } from './files-shared';

/**
 * The files module's entry point.
 *
 * Upload is a handshake — presign, then verify what landed — while reading and deleting are a
 * different concern with different authorization. They are two services now; this forwards to
 * them with the same constructor Nest and the specs already use.
 */
@Injectable()
export class FilesService {
  private readonly access: FilesAccessService;
  private readonly uploads: FilesUploadService;

  constructor(
    database: TenantDatabaseService,
    storage: StorageService,
    audit: AuditService,
    config: ConfigService,
    @InjectQueue('file-lifecycle') lifecycleQueue: Queue,
  ) {
    this.access = new FilesAccessService(database, storage, audit, config, lifecycleQueue);
    this.uploads = new FilesUploadService(database, storage, audit);
  }

  beginUpload(...args: Parameters<FilesUploadService['beginUpload']>) {
    return this.uploads.beginUpload(...args);
  }

  completeUpload(context: DomainContext, fileId: string, employeeId?: string) {
    return this.uploads.completeUpload(context, fileId, employeeId);
  }

  list(
    context: DomainContext,
    filters: { purpose?: FilePurpose; employeeId?: string; limit?: number } = {},
  ) {
    return this.access.list(context, filters);
  }

  download(context: DomainContext, fileId: string) {
    return this.access.download(context, fileId);
  }

  softDelete(...args: Parameters<FilesAccessService['softDelete']>) {
    return this.access.softDelete(...args);
  }

  purgeDeleted(fileId: string, organizationId: string) {
    return this.access.purgeDeleted(fileId, organizationId);
  }
}
