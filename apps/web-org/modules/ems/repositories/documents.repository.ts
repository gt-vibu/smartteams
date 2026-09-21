import {
  documentViewSchema,
  parseDocumentShares,
  parseDocuments,
  parseFileUploadTicket,
  type DocumentScope,
  type DocumentSection,
  type DocumentShare,
  type FilePurpose,
  type FileUploadTicket,
  type StoredDocument,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/**
 * Documents: the website's scoped view of files. The server decides every answer; nothing here
 * filters or grants anything. Bytes still go straight to storage through `filesRepository`.
 */
const base = (organizationId: string) => orgPath(organizationId, '/files');
const at = (organizationId: string, fileId: string) =>
  `${base(organizationId)}/${encodeURIComponent(fileId)}`;

export type DocumentUploadRequest = {
  scope: Exclude<DocumentScope, 'INTERNAL'>;
  purpose: FilePurpose;
  originalName: string;
  contentType: string;
  byteSize: number;
  employeeId?: string;
  teamId?: string;
  allowDownload?: boolean;
};

export type ShareRequest = {
  granteeType: 'USER' | 'ROLE' | 'TEAM';
  /** For a role or a team. */
  granteeId?: string;
  /** For a person, by their employee record. */
  granteeEmployeeId?: string;
  canDownload: boolean;
  expiresAt?: string;
};

export const documentsRepository = {
  async list(organizationId: string, section: DocumentSection): Promise<StoredDocument[]> {
    return parseDocuments(
      await apiRequest(`${base(organizationId)}/documents${queryString({ section })}`, {
        method: 'GET',
      }),
    );
  },

  async beginUpload(
    organizationId: string,
    input: DocumentUploadRequest,
  ): Promise<FileUploadTicket> {
    return expectShape(
      parseFileUploadTicket(
        await apiRequest(`${base(organizationId)}/documents/uploads`, {
          method: 'POST',
          body: input,
        }),
      ),
      'upload ticket',
    );
  },

  /** A short-lived link that opens the document in the browser. */
  async view(organizationId: string, fileId: string): Promise<string> {
    const parsed = documentViewSchema.safeParse(
      await apiRequest(`${at(organizationId, fileId)}/view`, { method: 'POST' }),
    );
    if (!parsed.success) throw new Error('The document could not be opened.');
    return parsed.data.viewUrl;
  },

  async shares(organizationId: string, fileId: string): Promise<DocumentShare[]> {
    return parseDocumentShares(
      await apiRequest(`${at(organizationId, fileId)}/shares`, { method: 'GET' }),
    );
  },

  async share(organizationId: string, fileId: string, input: ShareRequest): Promise<unknown> {
    return apiRequest(`${at(organizationId, fileId)}/shares`, { method: 'POST', body: input });
  },

  async revoke(organizationId: string, fileId: string, shareId: string): Promise<unknown> {
    return apiRequest(
      `${at(organizationId, fileId)}/shares/${encodeURIComponent(shareId)}/revoke`,
      { method: 'POST' },
    );
  },
};
