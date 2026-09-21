'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { DOCUMENT_REASON_LABEL, formatFileSize, type StoredDocument } from '@smarteam/contracts';

/** Who a document is for, in words. */
function audience(document: StoredDocument): string {
  switch (document.scope) {
    case 'PERSONAL':
      return 'Private';
    case 'EMPLOYEE':
      return document.employee ? document.employee.name : 'Employee';
    case 'TEAM':
      return document.team ? `Team: ${document.team.name}` : 'Team';
    case 'ORGANIZATION':
      return 'Everyone';
    case 'INTERNAL':
      return 'Administrators';
  }
}

const kind = (document: StoredDocument) =>
  (document.name.split('.').pop() ?? document.contentType.split('/').pop() ?? '').toUpperCase();

/**
 * Documents as a table: what it is, who it is for, why you can see it, and what you can do.
 * A download the server would refuse is shown as view-only rather than as a button that fails.
 */
export function DocumentTable({
  documents,
  busy,
  onView,
  onDownload,
  onShare,
  onDelete,
}: {
  documents: StoredDocument[];
  busy: boolean;
  onView: (document: StoredDocument) => void;
  onDownload: (document: StoredDocument) => void;
  onShare: (document: StoredDocument) => void;
  onDelete: (document: StoredDocument) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="stack-table w-full min-w-[760px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-bold">Name</th>
            <th className="px-3 py-2 font-bold">For</th>
            <th className="px-3 py-2 font-bold">Uploaded</th>
            <th className="px-3 py-2 font-bold">Access</th>
            <th className="px-3 py-2 text-right font-bold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {documents.map((document) => (
            <tr key={document.id}>
              <td className="px-3 py-2.5" data-cell="primary">
                <div className="font-semibold text-foreground break-all">{document.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {kind(document)} · {formatFileSize(document.byteSize)}
                </div>
              </td>
              <td className="px-3 py-2.5 text-foreground" data-label="For">
                {audience(document)}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground" data-label="Uploaded">
                <div>{new Date(document.uploadedAt).toLocaleDateString()}</div>
                {document.uploadedBy && <div className="text-[10px]">by {document.uploadedBy}</div>}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground" data-label="Access">
                <div>
                  {document.access.reason ? DOCUMENT_REASON_LABEL[document.access.reason] : ''}
                </div>
                <div className="text-[10px]">
                  {document.access.download ? 'View and download' : 'View only'}
                  {document.activeShares ? ` · shared ${document.activeShares}×` : ''}
                </div>
              </td>
              <td className="px-3 py-2.5" data-label="Actions">
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Button
                    disabled={busy}
                    onClick={() => onView(document)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    View
                  </Button>
                  {document.access.download && (
                    <Button
                      disabled={busy}
                      onClick={() => onDownload(document)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Download
                    </Button>
                  )}
                  {document.access.share && (
                    <Button
                      disabled={busy}
                      onClick={() => onShare(document)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Share
                    </Button>
                  )}
                  {document.access.manage && (
                    <Button
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => onDelete(document)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
