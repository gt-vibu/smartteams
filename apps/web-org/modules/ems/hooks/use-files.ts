'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  type FileObject,
  type FilePurpose,
  type StoredFile,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { filesRepository } from '../repositories/files.repository';
import { useAsyncResource } from './use-async-resource';

/**
 * File upload, download and deletion.
 *
 * The stored list comes from the API, which decides whose files the caller may see. The session
 * list is kept alongside it only so a file can be acted on the instant it finishes uploading.
 *
 * Nothing is written to browser storage.
 */
export function useFiles() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const employeeId = session?.employeeId ?? null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canRead = hasPermission(permissions, 'files.read');
  const canWrite = hasPermission(permissions, 'files.write');

  const stored = useAsyncResource<StoredFile[]>(
    () => filesRepository.list(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canRead },
  );

  const [uploaded, setUploaded] = useState<FileObject[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, purpose: FilePurpose) => {
      if (!organizationId) return false;
      setBusy(true);
      setError(null);
      try {
        const ticket = await filesRepository.beginUpload(organizationId, {
          purpose,
          originalName: file.name,
          contentType: file.type || 'application/octet-stream',
          byteSize: file.size,
          ...(employeeId ? { employeeId } : {}),
        });
        await filesRepository.putBytes(ticket.uploadUrl, file);
        const saved = await filesRepository.completeUpload(organizationId, ticket.fileId);
        setUploaded((current) => [saved, ...current]);
        await stored.refetch();
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The file could not be uploaded.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [employeeId, organizationId, stored],
  );

  /** Opens the presigned URL the API issues. The API never streams bytes itself. */
  const download = useCallback(
    async (fileId: string) => {
      if (!organizationId) return false;
      setBusy(true);
      setError(null);
      try {
        const link = await filesRepository.download(organizationId, fileId);
        if (typeof window !== 'undefined') window.open(link.downloadUrl, '_blank', 'noopener');
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The file could not be downloaded.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [organizationId],
  );

  const remove = useCallback(
    async (fileId: string, reason: string) => {
      if (!organizationId) return false;
      setBusy(true);
      setError(null);
      try {
        await filesRepository.remove(organizationId, fileId, reason);
        setUploaded((current) => current.filter((entry) => entry.id !== fileId));
        await stored.refetch();
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The file could not be deleted.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [organizationId, stored],
  );

  return {
    /** Everything the API says this caller may see. The boundary is applied server-side. */
    files: stored.data ?? [],
    listLoading: stored.loading,
    listError: stored.error,
    listForbidden: stored.forbidden || !canRead,
    refetch: stored.refetch,
    /** Files uploaded in this session, kept so a fresh upload can be acted on immediately. */
    uploaded,
    busy,
    error,
    dismissError: () => setError(null),
    upload,
    download,
    remove,
    canRead,
    canWrite,
  };
}

export type FilesState = ReturnType<typeof useFiles>;
