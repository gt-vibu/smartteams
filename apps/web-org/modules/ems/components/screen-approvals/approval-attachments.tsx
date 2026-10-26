'use client';
import { Button } from '@smarteam/ui';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import type { ApprovalInboxItem } from '../../hooks/use-approval-inbox';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

export function ApprovalAttachments({ item }: { item: ApprovalInboxItem }) {
  const { session } = useSession();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const open = async (id: string) => {
    if (!session?.organizationId) return;
    // Open in the click handler, before awaiting a signed URL, to avoid popup blocking.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setOpening(id);
    setError('');
    try {
      const result = await apiRequest(
        orgPath(session.organizationId, `/leave/requests/${item.id}/attachments/${id}/download`),
        { method: 'POST' },
      );
      if (
        !result ||
        typeof result !== 'object' ||
        !('downloadUrl' in result) ||
        typeof result.downloadUrl !== 'string'
      )
        throw new Error('Could not open this document.');
      if (!tab) throw new Error('Allow a new browser tab to open this document.');
      tab.location.href = result.downloadUrl;
    } catch (caught) {
      tab?.close();
      setError(caught instanceof Error ? caught.message : 'Could not open this document.');
    } finally {
      setOpening(null);
    }
  };
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold">Supporting documents</h3>
      {item.attachments?.map((file) => (
        <Button
          key={file.id}
          type="button"
          size="sm"
          variant="outline"
          disabled={opening !== null}
          onClick={() => void open(file.id)}
        >
          {opening === file.id ? 'Opening…' : file.name}
        </Button>
      ))}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
