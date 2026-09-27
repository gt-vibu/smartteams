import type { DocumentAccessReason, DocumentSection, StoredDocument } from '@smarteam/contracts';

/** Access that comes from an administrative role rather than from the person themselves. */
const ADMINISTRATIVE: ReadonlySet<DocumentAccessReason> = new Set(['ADMINISTRATOR', 'HR']);

/**
 * A document as the person sees it in their own workspace.
 *
 * Someone who also holds an HR or administrator role reaches every file through it, and the server
 * rightly allows them to manage any of them. In My Space, though, they are an employee looking at
 * their own documents: deleting a team's file or setting its expiry there, next to their own
 * payslips, is a slip waiting to happen. Those actions belong to the HR workspace, so here only
 * what they may do in their own right — their files, what they lead, what they uploaded — remains.
 * The server is unchanged and still checks every action.
 */
export function asOwnWorkspace(document: StoredDocument, section: DocumentSection): StoredDocument {
  const reason = document.access.reason;
  if (!reason || !ADMINISTRATIVE.has(reason)) return document;
  return {
    ...document,
    access: {
      ...document.access,
      manage: false,
      share: false,
      // Why they see it, as an employee would put it.
      reason:
        section === 'shared' ? 'SHARED' : document.scope === 'ORGANIZATION' ? 'ORGANIZATION' : null,
    },
  };
}
