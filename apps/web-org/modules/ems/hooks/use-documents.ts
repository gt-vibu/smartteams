'use client';

import { useCallback, useMemo, useState } from 'react';
import { hasPermission, type DocumentSection, type StoredDocument } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { filesRepository } from '../repositories/files.repository';
import {
  documentsRepository,
  type DocumentUploadRequest,
  type ShareRequest,
} from '../repositories/documents.repository';
import { useAsyncResource } from './use-async-resource';

/**
 * One section of documents, and what the caller can do with them.
 *
 * The permissions read here only choose which buttons to show. Every action is decided again by
 * the server, which refuses what the caller may not do however the request is made.
 */
export function useDocuments(
  section: DocumentSection,
  owner: { projectId?: string; teamId?: string } = {},
) {
  const { projectId, teamId } = owner;
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const can = {
    read: hasPermission(permissions, 'files.read'),
    write: hasPermission(permissions, 'files.write'),
    publish: hasPermission(permissions, 'files.organization.manage'),
    readAll: hasPermission(permissions, 'files.read.all'),
  };

  const list = useAsyncResource<StoredDocument[]>(
    () => documentsRepository.list(organizationId!, section, { projectId, teamId }),
    [organizationId, section, projectId, teamId],
    { enabled: Boolean(organizationId) && can.read },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = useCallback(
    async (work: () => Promise<unknown>, fallback: string, refresh = true) => {
      if (!organizationId) return false;
      setBusy(true);
      setError(null);
      try {
        await work();
        if (refresh) await list.refetch();
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : fallback);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [list, organizationId],
  );

  const open = (url: string) => {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  };

  return {
    documents: list.data ?? [],
    loading: list.loading,
    listError: list.error,
    refetch: list.refetch,
    busy,
    error,
    dismissError: () => setError(null),
    can,
    upload: (
      file: File,
      request: Omit<DocumentUploadRequest, 'originalName' | 'contentType' | 'byteSize'>,
    ) =>
      act(async () => {
        const ticket = await documentsRepository.beginUpload(organizationId!, {
          ...request,
          originalName: file.name,
          contentType: file.type || 'application/octet-stream',
          byteSize: file.size,
        });
        await filesRepository.putBytes(ticket.uploadUrl, file);
        await filesRepository.completeUpload(organizationId!, ticket.fileId);
      }, 'The document could not be uploaded.'),
    view: (fileId: string) =>
      act(
        async () => open(await documentsRepository.view(organizationId!, fileId)),
        'The document could not be opened.',
        false,
      ),
    download: (fileId: string) =>
      act(
        async () => open((await filesRepository.download(organizationId!, fileId)).downloadUrl),
        'The document could not be downloaded.',
        false,
      ),
    remove: (fileId: string, reason: string) =>
      act(
        () => filesRepository.remove(organizationId!, fileId, reason),
        'The document could not be deleted.',
      ),
    shares: (fileId: string) => documentsRepository.shares(organizationId!, fileId),
    share: (fileId: string, request: ShareRequest) =>
      act(
        () => documentsRepository.share(organizationId!, fileId, request),
        'The document could not be shared.',
      ),
    revoke: (fileId: string, shareId: string) =>
      act(
        () => documentsRepository.revoke(organizationId!, fileId, shareId),
        'The share could not be removed.',
      ),
  };
}

export type DocumentsState = ReturnType<typeof useDocuments>;
