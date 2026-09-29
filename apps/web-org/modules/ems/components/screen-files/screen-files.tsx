'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';
import type { DocumentSection, StoredDocument } from '@smarteam/contracts';
import { FolderOpen, Upload } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { PageShell } from '../layout/page-shell';
import { useAuth } from '../../hooks/use-auth';
import { useDocuments } from '../../hooks/use-documents';
import { DocumentTable } from './document-table';
import { DocumentUploadDialog } from './document-upload-dialog';
import { DocumentExpiryDialog } from './document-expiry-dialog';
import { DocumentShareDialog } from './document-share-dialog';
import { asOwnWorkspace } from './workspace-access';
import { LIMITS } from '@smarteam/contracts';

/**
 * Documents, by who they are for.
 *
 * The employee workspace shows your files, what was shared with you, the company's documents and
 * your teams'. The admin workspace shows the company's, employees' and teams' documents. The server
 * decides every list and every action from the signed-in person; in the employee workspace the
 * actions someone holds only through an HR or administrator role are left for the admin workspace
 * (`asOwnWorkspace`).
 */
const SECTIONS: Record<
  'EMPLOYEE' | 'ADMIN',
  Array<{ id: DocumentSection; label: string; empty: string }>
> = {
  EMPLOYEE: [
    {
      id: 'mine',
      label: 'My files',
      empty: 'Your private files and documents about you appear here.',
    },
    { id: 'shared', label: 'Shared with me', empty: 'Nothing has been shared with you yet.' },
    { id: 'organization', label: 'Company', empty: 'No company documents have been published.' },
    { id: 'team', label: 'My teams', empty: 'Your teams have no documents yet.' },
    { id: 'project', label: 'My projects', empty: 'Your projects have no documents yet.' },
  ],
  ADMIN: [
    { id: 'organization', label: 'Company', empty: 'No company documents have been published.' },
    { id: 'employees', label: 'Employee files', empty: 'No employee documents yet.' },
    { id: 'team', label: 'Team files', empty: 'No team documents yet.' },
    { id: 'project', label: 'Project files', empty: 'No project documents yet.' },
  ],
};

export function ScreenFiles() {
  const { workspaceContext } = useAuth();
  const workspace = workspaceContext === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';
  const sections = SECTIONS[workspace];
  const [sectionId, setSectionId] = useState<DocumentSection>(sections[0]!.id);
  const section = sections.find((entry) => entry.id === sectionId) ?? sections[0]!;
  const documents = useDocuments(section.id);
  const [expiring, setExpiring] = useState<StoredDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState<StoredDocument | null>(null);
  const [deleting, setDeleting] = useState<StoredDocument | null>(null);
  const [reason, setReason] = useState('');
  const canUpload =
    workspace === 'EMPLOYEE' ? documents.can.write : documents.can.publish || documents.can.readAll;

  const confirmDelete = async () => {
    if (!deleting || reason.trim().length < 3) return;
    if (await documents.remove(deleting.id, reason.trim())) {
      setReason('');
      setDeleting(null);
    }
  };

  return (
    <PageShell>
      <ScreenHeader
        actions={
          canUpload && (
            <Button className="gap-1.5" onClick={() => setUploading(true)} size="sm" type="button">
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
          )
        }
        icon={FolderOpen}
        title="Files"
        tone="neutral"
      />

      {!documents.can.read ? (
        <p
          className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground"
          role="status"
        >
          You do not have permission to view documents.
        </p>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
            {sections.map((entry) => (
              <button
                aria-selected={entry.id === section.id}
                className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  entry.id === section.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                key={entry.id}
                onClick={() => setSectionId(entry.id)}
                role="tab"
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>

          {documents.error && !uploading && !sharing && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
              role="alert"
            >
              {documents.error}
            </p>
          )}

          {documents.loading ? (
            <p className="py-8 text-center text-xs text-muted-foreground" role="status">
              Loading documents…
            </p>
          ) : documents.listError ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center" role="alert">
              <p className="text-sm font-bold text-foreground">Could not load documents</p>
              <p className="mt-1 text-xs text-muted-foreground">{documents.listError}</p>
              <Button
                className="mt-3"
                onClick={() => void documents.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          ) : documents.documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-card/60 p-8 text-center text-xs text-muted-foreground">
              {section.empty}
            </p>
          ) : (
            <DocumentTable
              busy={documents.busy}
              documents={
                workspace === 'EMPLOYEE'
                  ? documents.documents.map((document) => asOwnWorkspace(document, section.id))
                  : documents.documents
              }
              onDelete={setDeleting}
              onDownload={(document) => void documents.download(document.id)}
              onSetExpiry={setExpiring}
              onShare={setSharing}
              onView={(document) => void documents.view(document.id)}
            />
          )}
        </>
      )}

      <DocumentUploadDialog
        adminWorkspace={workspace === 'ADMIN'}
        documents={documents}
        onOpenChange={setUploading}
        open={uploading}
      />
      <DocumentShareDialog
        document={sharing}
        documents={documents}
        onClose={() => setSharing(null)}
      />

      <Dialog onOpenChange={(open) => !open && setDeleting(null)} open={deleting !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            It stops being available at once and is removed from storage after the retention period.
          </p>
          <div className="mt-4">
            <Label className="mb-1 block" htmlFor="delete-reason">
              Reason
            </Label>
            <Textarea
              maxLength={LIMITS.reason}
              id="delete-reason"
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              value={reason}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDeleting(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length < 3 || documents.busy}
              onClick={() => void confirmDelete()}
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <DocumentExpiryDialog
        document={expiring}
        onClose={() => setExpiring(null)}
        onSaved={() => void documents.refetch()}
      />
    </PageShell>
  );
}
