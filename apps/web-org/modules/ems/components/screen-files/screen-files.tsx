'use client';

import React, { useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@smarteam/ui';
import { formatFileSize, type FilePurpose } from '@smarteam/contracts';
import { FolderOpen } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useFiles } from '../../hooks/use-files';

/**
 * Files.
 *
 * Replaces a document library built on `files.json` — categories, security classifications and a
 * searchable list of company handbooks and Form 16s, none of which existed on the server. Every
 * "download" was a `#` link.
 *
 * The list is the API's answer to "what may this caller see", not a client-side filter: a normal
 * employee gets their own files, an organization-wide permission gets the tenant's.
 */

const PURPOSES: Array<{ value: FilePurpose; label: string }> = [
  { value: 'EMPLOYEE_DOCUMENT', label: 'Employee document' },
  { value: 'RESUME', label: 'Resume' },
  { value: 'PROFILE_IMAGE', label: 'Profile image' },
  { value: 'OTHER', label: 'Other' },
];

export function ScreenFiles() {
  const files = useFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  const [purpose, setPurpose] = useState<FilePurpose>('EMPLOYEE_DOCUMENT');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const pick = () => inputRef.current?.click();

  const onPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await files.upload(file, purpose);
  };

  const confirmDelete = async () => {
    if (!deleting || reason.trim().length < 3) return;
    const ok = await files.remove(deleting, reason.trim());
    if (ok) {
      setReason('');
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <ScreenHeader
        description="Upload a document to secure storage, then download or remove it."
        icon={FolderOpen}
        title="Files"
        tone="neutral"
      />

      {!files.canWrite && !files.canRead && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
          <p className="text-sm font-bold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to work with files.
          </p>
        </div>
      )}

      {files.canWrite && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Label className="mb-1 block">Purpose</Label>
              <SelectMenu
                onValueChange={(value) => setPurpose(value as FilePurpose)}
                value={purpose}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
            <Button disabled={files.busy} onClick={pick} size="sm" type="button">
              {files.busy ? 'Working...' : 'Choose a file'}
            </Button>
            <input className="hidden" onChange={onPicked} ref={inputRef} type="file" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            The API decides which types and sizes each purpose allows, and verifies the stored
            file&apos;s size and checksum before accepting it.
          </p>
        </section>
      )}

      {files.error && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {files.error}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-bold text-foreground">Stored documents</h2>

        {files.listForbidden && (
          <div className="rounded-lg border border-border bg-card p-8 text-center" role="status">
            <p className="text-xs text-muted-foreground">
              You do not have permission to view stored files.
            </p>
          </div>
        )}

        {!files.listForbidden && files.listLoading && (
          <p className="py-8 text-center text-xs text-muted-foreground" role="status">
            Loading files...
          </p>
        )}

        {!files.listForbidden && !files.listLoading && files.listError && (
          <div className="rounded-lg border border-border bg-card p-8 text-center" role="alert">
            <p className="text-sm font-bold text-foreground">Could not load files</p>
            <p className="mt-1 text-xs text-muted-foreground">{files.listError}</p>
            <Button
              className="mt-3"
              onClick={() => void files.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        )}

        {!files.listForbidden &&
          !files.listLoading &&
          !files.listError &&
          files.files.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-xs text-muted-foreground">No documents are stored for you yet.</p>
            </div>
          )}

        {files.files.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-bold">File</th>
                  <th className="px-4 py-2.5 font-bold">Purpose</th>
                  <th className="px-4 py-2.5 font-bold">Size</th>
                  <th className="px-4 py-2.5 font-bold">Added</th>
                  <th className="px-4 py-2.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.files.map((file) => (
                  <tr
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                    key={file.id}
                  >
                    <td className="px-4 py-2.5 font-semibold text-foreground">
                      {file.originalName}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {file.purpose.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {formatFileSize(file.byteSize)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {file.createdAt.slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          disabled={files.busy}
                          onClick={() => void files.download(file.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Download
                        </Button>
                        {files.canWrite && (
                          <Button
                            disabled={files.busy}
                            onClick={() => setDeleting(file.id)}
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
        )}

        <p className="text-[11px] text-muted-foreground">
          The API decides which files you can see: your own unless you hold the organization-wide
          permission. Payslip documents remain reachable from the payslip they belong to.
        </p>
      </section>

      <Dialog onOpenChange={(open) => !open && setDeleting(null)} open={deleting !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete this file</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            The reason is recorded in the audit trail. The file is purged after the retention
            period.
          </p>
          <div className="mt-4 space-y-3">
            <Label className="block" htmlFor="file-delete-reason">
              Reason
            </Label>
            <Textarea
              disabled={files.busy}
              id="file-delete-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
            <div className="flex justify-end gap-2">
              <Button
                disabled={files.busy}
                onClick={() => setDeleting(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={files.busy || reason.trim().length < 3}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {files.busy ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
