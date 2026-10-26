'use client';

import { Button, Label } from '@smarteam/ui';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { filesRepository } from '../../repositories/files.repository';

export type LeaveAttachment = { id: string; name: string };

export function LeaveAttachmentInput({
  value,
  onChange,
  disabled,
  required,
  onBusy,
}: {
  value: LeaveAttachment[];
  onChange: (value: LeaveAttachment[]) => void;
  disabled: boolean;
  required: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { session } = useSession();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file || !session?.organizationId || !session.employeeId) return;
    setError('');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setError('Choose a PDF, JPG, or PNG document.');
      return;
    }
    if (file.size > 15_000_000 || file.size === 0) {
      setError('Choose a non-empty file up to 15 MB.');
      return;
    }
    setBusy(true);
    onBusy(true);
    try {
      const ticket = await filesRepository.beginUpload(session.organizationId, {
        purpose: 'LEAVE_ATTACHMENT',
        employeeId: session.employeeId,
        originalName: file.name,
        contentType: file.type,
        byteSize: file.size,
      });
      await filesRepository.putBytes(ticket.uploadUrl, file);
      const stored = await filesRepository.completeUpload(session.organizationId, ticket.fileId);
      onChange([...value, { id: stored.id, name: file.name }]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Upload failed. Choose the file again to retry.',
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Label htmlFor="leave-attachment">
        Supporting documents {required ? '(required)' : '(optional)'}
      </Label>
      <input
        id="leave-attachment"
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        disabled={disabled || busy || value.length >= 5}
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = '';
        }}
        className="block w-full text-xs"
      />
      <p className="text-[11px] text-muted-foreground">
        PDF, JPG, or PNG. Up to 15 MB per file, five files per request.
      </p>
      {busy && <p role="status">Uploading document…</p>}
      {value.map((file) => (
        <div key={file.id} className="flex items-center justify-between gap-2">
          <span className="break-all">{file.name}</span>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={disabled || busy}
            onClick={() => onChange(value.filter((item) => item.id !== file.id))}
          >
            Remove
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
