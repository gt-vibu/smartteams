import {
  parseFileDownload,
  parseStoredFileList,
  parseFileObject,
  parseFileUploadTicket,
  type FileDownload,
  type FileObject,
  type FilePurpose,
  type FileUploadTicket,
  type StoredFile,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/**
 * File data access.
 *
 * Listing was added only after `download` became self-scoped: a list on top of an unscoped read
 * would have turned "guess a file id" into "enumerate every payslip in the tenant". The API
 * applies the same boundary to both.
 *
 * Upload is a three-step flow, which is why it is not a single call: the API issues a presigned
 * URL, the browser PUTs the bytes straight to object storage, and the API then verifies the
 * stored object's size and checksum before marking the file available.
 */

const base = (organizationId: string) => orgPath(organizationId, '/files');

export type UploadRequest = {
  purpose: FilePurpose;
  originalName: string;
  contentType: string;
  byteSize: number;
  employeeId?: string;
};

export const filesRepository = {
  /**
   * Files the caller may see. The API applies the boundary: `files.read` returns the caller's own
   * employee's files, `files.read.all` the tenant's. Nothing is filtered client-side.
   */
  async list(organizationId: string, filters: { purpose?: string } = {}): Promise<StoredFile[]> {
    return expectShape(
      parseStoredFileList(
        await apiRequest(`${base(organizationId)}${queryString(filters)}`, { method: 'GET' }),
      ),
      'file list',
    );
  },

  /** Step one: register the file and get a presigned URL to upload to. */
  async beginUpload(organizationId: string, input: UploadRequest): Promise<FileUploadTicket> {
    return expectShape(
      parseFileUploadTicket(
        await apiRequest(`${base(organizationId)}/uploads`, { method: 'POST', body: input }),
      ),
      'file upload ticket',
    );
  },

  /**
   * Step two: send the bytes to object storage.
   *
   * This does not go through `apiRequest` — it is a direct PUT to the storage provider, and must
   * not carry the session cookie. A failure here leaves the record `PENDING_UPLOAD`, which the
   * API refuses to complete.
   */
  async putBytes(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    if (!response.ok) {
      throw new Error(`The file could not be uploaded to storage (${response.status}).`);
    }
  },

  /** Step three: the API verifies the stored object matches what was declared. */
  async completeUpload(organizationId: string, fileId: string): Promise<FileObject> {
    return expectShape(
      parseFileObject(
        await apiRequest(`${base(organizationId)}/${encodeURIComponent(fileId)}/complete`, {
          method: 'POST',
        }),
      ),
      'file',
    );
  },

  /** A short-lived presigned download URL. The API does not stream the file itself. */
  async download(organizationId: string, fileId: string): Promise<FileDownload> {
    return expectShape(
      parseFileDownload(
        await apiRequest(`${base(organizationId)}/${encodeURIComponent(fileId)}/download`, {
          method: 'POST',
        }),
      ),
      'file download',
    );
  },

  /** Soft delete. The API requires a reason, audits it, and schedules the purge. */
  async remove(organizationId: string, fileId: string, reason: string): Promise<unknown> {
    return apiRequest(`${base(organizationId)}/${encodeURIComponent(fileId)}/delete`, {
      method: 'POST',
      body: { reason },
    });
  },
};
