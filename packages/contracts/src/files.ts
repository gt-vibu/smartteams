import { z } from 'zod';

/**
 * File shapes, matching what `FilesService` returns.
 *
 * The backend models file metadata richly — purpose, status, size, content type, owner, soft
 * deletion — but exposes only four operations: begin an upload, complete it, get a download URL,
 * and soft-delete. **There is no list route and no list method in the service**, so there is no
 * schema here for a collection of files: one cannot be parsed because none is ever returned.
 */

export const filePurposeSchema = z.enum([
  'PROFILE_IMAGE',
  'RESUME',
  'EMPLOYEE_DOCUMENT',
  'LEAVE_ATTACHMENT',
  'PAYSLIP',
  'PAYROLL_EXPORT',
  'IMPORT',
  'OTHER',
]);

/** What `POST /files/uploads` returns: the record, plus a presigned URL to PUT the bytes to. */
export const fileUploadTicketSchema = z.object({
  fileId: z.string().uuid(),
  objectKey: z.string(),
  uploadUrl: z.string(),
  expiresIn: z.number(),
});

/** What `POST /files/:id/complete` returns once the stored object matches what was declared. */
export const fileObjectSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  purpose: filePurposeSchema,
  status: z.string(),
  originalName: z.string(),
  contentType: z.string(),
  /** `BigInt` on the server, so it arrives as a string or a number. */
  byteSize: z.union([z.string(), z.number()]).transform((value) => Number(value)),
  createdAt: z.string().optional(),
});

export const fileDownloadSchema = z.object({
  fileId: z.string().uuid(),
  downloadUrl: z.string(),
  expiresIn: z.number(),
});

export type FilePurpose = z.infer<typeof filePurposeSchema>;
export type FileUploadTicket = z.infer<typeof fileUploadTicketSchema>;
export type FileObject = z.infer<typeof fileObjectSchema>;
export type FileDownload = z.infer<typeof fileDownloadSchema>;

export function parseFileUploadTicket(payload: unknown): FileUploadTicket | null {
  const result = fileUploadTicketSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseFileObject(payload: unknown): FileObject | null {
  const result = fileObjectSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseFileDownload(payload: unknown): FileDownload | null {
  const result = fileDownloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** `2.4 MB`. Presentation only — the byte count is the server's. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A stored file as `GET /files` returns it. */
export const storedFileSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid().nullable(),
  purpose: filePurposeSchema,
  status: z.string(),
  originalName: z.string(),
  contentType: z.string(),
  byteSize: z.union([z.string(), z.number()]).transform((value) => Number(value)),
  createdAt: z.string(),
});

export type StoredFile = z.infer<typeof storedFileSchema>;

export function parseStoredFileList(payload: unknown): StoredFile[] | null {
  const items = Array.isArray(payload) ? payload : [];
  const result = z.array(storedFileSchema).safeParse(items);
  return result.success ? result.data : null;
}
