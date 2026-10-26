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

/** Entry point for native and federation file operations. */
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

  completeUpload(
    context: DomainContext,
    fileId: string,
    employeeId?: string,
    purpose?: FilePurpose | FilePurpose[],
  ) {
    return this.uploads.completeUpload(context, fileId, employeeId, purpose);
  }

  list(
    context: DomainContext,
    filters: { purpose?: FilePurpose; employeeId?: string; limit?: number } = {},
  ) {
    return this.access.list(context, filters);
  }

  listEmployeeDocuments(context: DomainContext, employeeId: string) {
    return this.access.listEmployeeDocuments(context, employeeId);
  }

  download(
    context: DomainContext,
    fileId: string,
    employeeId?: string,
    purpose?: FilePurpose | FilePurpose[],
  ) {
    return this.access.download(context, fileId, employeeId, purpose);
  }

  softDelete(...args: Parameters<FilesAccessService['softDelete']>) {
    return this.access.softDelete(...args);
  }

  purgeDeleted(fileId: string, organizationId: string) {
    return this.access.purgeDeleted(fileId, organizationId);
  }
}
