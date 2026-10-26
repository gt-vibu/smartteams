import { z } from 'zod';
import { filePurposeSchema } from './files';

/** Who a document is for. The server decides access from this, never from who uploaded it. */
export const documentScopeSchema = z.enum([
  'PERSONAL',
  'EMPLOYEE',
  'TEAM',
  'PROJECT',
  'ORGANIZATION',
  'INTERNAL',
]);

/** Why the caller can see a document, so the screen can say so. */
export const documentAccessReasonSchema = z.enum([
  'OWNER',
  'ABOUT_YOU',
  'HR',
  'MANAGER',
  'TEAM',
  'TEAM_LEAD',
  'PROJECT',
  'PROJECT_LEAD',
  'ORGANIZATION',
  'ADMINISTRATOR',
  'SHARED',
]);

export const documentSectionSchema = z.enum([
  'all',
  'mine',
  'shared',
  'organization',
  'team',
  'project',
  'employees',
  'internal',
]);

export const documentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  purpose: filePurposeSchema,
  scope: documentScopeSchema,
  contentType: z.string(),
  byteSize: z.union([z.string(), z.number()]).transform((value) => Number(value)),
  uploadedAt: z.string(),
  uploadedBy: z.string().nullable(),
  employee: z
    .object({ id: z.string().uuid(), name: z.string(), employeeNumber: z.string() })
    .nullable(),
  team: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  // Optional: a response from before project files existed has no such field.
  project: z
    .object({ id: z.string().uuid(), name: z.string(), code: z.string() })
    .nullable()
    .optional(),
  allowDownload: z.boolean(),
  expiresOn: z.string().nullable().optional(),
  activeShares: z.number().optional(),
  access: z.object({
    view: z.boolean(),
    download: z.boolean(),
    manage: z.boolean(),
    share: z.boolean(),
    reason: documentAccessReasonSchema.nullable(),
  }),
});

export const documentShareSchema = z.object({
  id: z.string().uuid(),
  granteeType: z.enum(['USER', 'ROLE', 'TEAM']),
  granteeId: z.string(),
  granteeName: z.string(),
  canDownload: z.boolean(),
  expiresAt: z.string().nullable(),
  expired: z.boolean(),
  createdAt: z.string(),
});

export const documentViewSchema = z.object({
  fileId: z.string().uuid(),
  displayName: z.string(),
  viewUrl: z.string(),
  expiresIn: z.number(),
});

export type DocumentScope = z.infer<typeof documentScopeSchema>;
export type DocumentAccessReason = z.infer<typeof documentAccessReasonSchema>;
export type DocumentSection = z.infer<typeof documentSectionSchema>;
export type StoredDocument = z.infer<typeof documentSchema>;
export type DocumentShare = z.infer<typeof documentShareSchema>;

/** Rows that fail to parse are dropped rather than failing the whole list. */
export function parseDocuments(payload: unknown): StoredDocument[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const parsed = documentSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseDocumentShares(payload: unknown): DocumentShare[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const parsed = documentShareSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Plain words for why a document is visible, shown beside it. */
export const DOCUMENT_REASON_LABEL: Record<DocumentAccessReason, string> = {
  OWNER: 'Private to you',
  ABOUT_YOU: 'About you',
  HR: 'Employee record',
  MANAGER: 'Your report',
  TEAM: 'Your team',
  TEAM_LEAD: 'You lead this team',
  PROJECT: 'Your project',
  PROJECT_LEAD: 'You lead this project',
  ORGANIZATION: 'Company-wide',
  ADMINISTRATOR: 'You publish this',
  SHARED: 'Shared with you',
};
