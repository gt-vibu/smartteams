'use client';

import React, { useRef, useState } from 'react';
import { LoadingIndicator, Button, Input } from '@smarteam/ui';
import {
  DOCUMENT_REASON_LABEL,
  formatDate,
  formatFileSize,
  type StoredDocument,
  LIMITS,
} from '@smarteam/contracts';
import { Upload } from 'lucide-react';
import { useDocuments } from '../../hooks/use-documents';

/**
 * A project's or a team's shared files — the same hierarchy for both.
 *
 * Everyone in the group reads them; the lead looks after all of them; a member may remove what
 * they added themselves. The server decides each of those per file, so every button below comes
 * from that file's own answer rather than from a guess about the viewer.
 */
export function GroupFilesSection({
  kind,
  groupId,
  canUpload,
}: {
  kind: 'project' | 'team';
  groupId: string;
  /** Whether this viewer is in the group, leads it, or administers files. */
  canUpload: boolean;
}) {
  const documents = useDocuments(
    kind,
    kind === 'project' ? { projectId: groupId } : { teamId: groupId },
  );
  const leadReason = kind === 'project' ? 'PROJECT_LEAD' : 'TEAM_LEAD';
  const picker = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<StoredDocument | null>(null);
  const [reason, setReason] = useState('');
  const mayUpload = canUpload && documents.can.write;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    await documents.upload(
      file,
      kind === 'project'
        ? { scope: 'PROJECT', purpose: 'OTHER', projectId: groupId }
        : { scope: 'TEAM', purpose: 'OTHER', teamId: groupId },
    );
    if (picker.current) picker.current.value = '';
  };

  const remove = async () => {
    if (!removing || reason.trim().length < 3) return;
    if (await documents.remove(removing.id, reason.trim())) {
      setRemoving(null);
      setReason('');
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Files ({documents.documents.length})
        </span>
        {mayUpload && (
          <>
            <input
              aria-label={`Choose a file to add to this ${kind}`}
              className="hidden"
              onChange={(event) => void upload(event.target.files?.[0])}
              ref={picker}
              type="file"
            />
            <Button
              className="gap-1.5"
              disabled={documents.busy}
              onClick={() => picker.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Upload className="h-3.5 w-3.5" />
              {documents.busy ? 'Working…' : 'Add file'}
            </Button>
          </>
        )}
      </div>

      {documents.error && (
        <p className="text-[11px] font-semibold text-destructive" role="alert">
          {documents.error}
        </p>
      )}

      {documents.loading ? (
        <LoadingIndicator variant="inline" label="Loading files" className="text-xs text-muted-foreground" />
      ) : documents.documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {mayUpload
            ? `No files yet. Add one to share it with everyone on the ${kind}.`
            : `No files have been shared on this ${kind}.`}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {documents.documents.map((document) => (
            <li className="rounded-md border border-border bg-card px-3 py-2" key={document.id}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {document.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatFileSize(document.byteSize)}
                    {document.uploadedBy ? ` · ${document.uploadedBy}` : ''} ·{' '}
                    {formatDate(document.uploadedAt)}
                    {document.access.reason === leadReason
                      ? ` · ${DOCUMENT_REASON_LABEL[leadReason]}`
                      : ''}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Button
                  disabled={documents.busy}
                  onClick={() => void documents.view(document.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  View
                </Button>
                {document.access.download && (
                  <Button
                    disabled={documents.busy}
                    onClick={() => void documents.download(document.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Download
                  </Button>
                )}
                {document.access.manage && (
                  <Button
                    className="text-destructive"
                    disabled={documents.busy}
                    onClick={() => {
                      setRemoving(document);
                      setReason('');
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                )}
              </div>
              {removing?.id === document.id && (
                <div className="mt-2 space-y-2 rounded-md border border-border p-2">
                  <Input
                    maxLength={LIMITS.reason}
                    aria-label="Why this file is being removed"
                    disabled={documents.busy}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why is it being removed?"
                    value={reason}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      disabled={documents.busy}
                      onClick={() => setRemoving(null)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={documents.busy || reason.trim().length < 3}
                      onClick={() => void remove()}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Remove file
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
