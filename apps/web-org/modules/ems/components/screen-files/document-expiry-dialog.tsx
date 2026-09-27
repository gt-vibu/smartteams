'use client';

import React, { useEffect, useState } from 'react';
import { Button, DatePicker, Dialog, DialogContent, DialogTitle, Label } from '@smarteam/ui';
import { formatDate, type StoredDocument } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { localDateKey } from '../../lib/local-date';

/** When a document stops being valid. Its person and HR are told a month ahead. */
export function DocumentExpiryDialog({
  document,
  onClose,
  onSaved,
}: {
  document: StoredDocument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useSession();
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setExpiresOn(document?.expiresOn ?? '');
    setError('');
  }, [document]);

  const save = async (value: string | null) => {
    if (!document || !session) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(
        orgPath(session.organizationId, `/files/${encodeURIComponent(document.id)}/expiry`),
        { method: 'POST', body: { expiresOn: value } },
      );
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={(next) => !next && !busy && onClose()} open={document !== null}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Expiry date</DialogTitle>
        <p className="text-xs text-muted-foreground">
          For a passport, visa or contract. The person it is about and HR are reminded a month
          before, and again on the day.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <Label className="mb-1 block" htmlFor="document-expiry">
              Valid until
            </Label>
            <DatePicker
              disabled={busy}
              id="document-expiry"
              onChange={setExpiresOn}
              value={expiresOn}
            />
          </div>
          {error && (
            <p className="text-[11px] font-semibold text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {document?.expiresOn && (
              <Button disabled={busy} onClick={() => void save(null)} type="button" variant="ghost">
                Does not expire
              </Button>
            )}
            <Button
              disabled={busy || !expiresOn}
              onClick={() => void save(expiresOn)}
              type="button"
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Expires in 12 days", "Expired" — or nothing for a document without a date. */
export function expiryNote(expiresOn: string | null | undefined) {
  if (!expiresOn) return null;
  const days = Math.round(
    (new Date(`${expiresOn}T00:00:00Z`).getTime() -
      new Date(`${localDateKey()}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days < 0) return { text: 'Expired', urgent: true };
  if (days === 0) return { text: 'Expires today', urgent: true };
  if (days <= 30) return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, urgent: true };
  return { text: `Valid until ${formatDate(expiresOn)}`, urgent: false };
}
