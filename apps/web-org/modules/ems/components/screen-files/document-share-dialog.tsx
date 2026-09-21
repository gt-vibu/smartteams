'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { employeeDisplayName, type DocumentShare, type StoredDocument } from '@smarteam/contracts';
import type { DocumentsState } from '../../hooks/use-documents';
import { useEmployees, useTeams } from '../../hooks/use-workforce';
import { useRoles } from '../../hooks/use-roles';

type Grantee = 'USER' | 'ROLE' | 'TEAM';

/**
 * Who a document is shared with, and sharing it with one more person, role or team. Removing a
 * share ends that access on the grantee's next request.
 */
export function DocumentShareDialog({
  document,
  documents,
  onClose,
}: {
  document: StoredDocument | null;
  documents: DocumentsState;
  onClose: () => void;
}) {
  const [shares, setShares] = useState<DocumentShare[]>([]);
  const [grantee, setGrantee] = useState<Grantee>('USER');
  const [target, setTarget] = useState('');
  const [canDownload, setCanDownload] = useState(false);
  const [expiresOn, setExpiresOn] = useState('');
  const employees = useEmployees();
  const teams = useTeams();
  const roles = useRoles();
  const fileId = document?.id ?? null;
  const { shares: loadShares } = documents;

  const reload = useCallback(async () => {
    if (!fileId) return;
    try {
      setShares(await loadShares(fileId));
    } catch {
      setShares([]);
    }
    // `loadShares` is recreated each render; the file is what decides the list.
  }, [fileId]);

  useEffect(() => {
    setTarget('');
    setCanDownload(false);
    setExpiresOn('');
    void reload();
  }, [reload]);

  const choices =
    grantee === 'USER'
      ? (employees.data ?? []).map((employee) => ({
          id: employee.id,
          name: `${employeeDisplayName(employee)} · ${employee.employeeNumber}`,
        }))
      : grantee === 'ROLE'
        ? roles.roles.map((role) => ({ id: role.id, name: role.name }))
        : (teams.data ?? []).map((team) => ({ id: team.id, name: team.name }));

  const add = async () => {
    if (!fileId || !target) return;
    const ok = await documents.share(fileId, {
      granteeType: grantee,
      ...(grantee === 'USER' ? { granteeEmployeeId: target } : { granteeId: target }),
      canDownload,
      ...(expiresOn ? { expiresAt: new Date(`${expiresOn}T23:59:59`).toISOString() } : {}),
    });
    if (ok) {
      setTarget('');
      await reload();
    }
  };

  const remove = async (shareId: string) => {
    if (fileId && (await documents.revoke(fileId, shareId))) await reload();
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={document !== null}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Share “{document?.name}”</DialogTitle>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div>
              <Label className="mb-1 block">With</Label>
              <SelectMenu
                onValueChange={(value) => {
                  setGrantee(value as Grantee);
                  setTarget('');
                }}
                value={grantee}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">A person</SelectItem>
                  {!roles.forbidden && <SelectItem value="ROLE">A role</SelectItem>}
                  <SelectItem value="TEAM">A team</SelectItem>
                </SelectContent>
              </SelectMenu>
            </div>
            <div>
              <Label className="mb-1 block">
                {grantee === 'USER' ? 'Person' : grantee === 'ROLE' ? 'Role' : 'Team'}
              </Label>
              <SelectMenu onValueChange={setTarget} value={target}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((choice) => (
                    <SelectItem key={choice.id} value={choice.id}>
                      {choice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                checked={canDownload}
                onChange={(event) => setCanDownload(event.target.checked)}
                type="checkbox"
              />
              Can download
            </label>
            <div>
              <Label className="mb-1 block" htmlFor="share-expires">
                Until (optional)
              </Label>
              <DatePicker
                id="share-expires"
                min={new Date().toLocaleDateString('en-CA')}
                onChange={setExpiresOn}
                placeholder="No end date"
                value={expiresOn}
              />
            </div>
          </div>
          {documents.error && (
            <p className="text-xs text-destructive" role="alert">
              {documents.error}
            </p>
          )}
          <div className="flex justify-end">
            <Button disabled={!target || documents.busy} onClick={() => void add()} type="button">
              Share
            </Button>
          </div>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold text-foreground">Shared with</p>
            {shares.length === 0 ? (
              <p className="text-xs text-muted-foreground">Not shared with anyone yet.</p>
            ) : (
              <ul className="divide-y divide-border/60 text-xs">
                {shares.map((share) => (
                  <li className="flex items-center justify-between gap-2 py-2" key={share.id}>
                    <span>
                      <span className="font-semibold text-foreground">{share.granteeName}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {share.granteeType === 'USER'
                          ? 'Person'
                          : share.granteeType === 'ROLE'
                            ? 'Role'
                            : 'Team'}
                        {' · '}
                        {share.canDownload ? 'view and download' : 'view only'}
                        {share.expiresAt
                          ? ` · ${share.expired ? 'expired' : 'until'} ${new Date(share.expiresAt).toLocaleDateString()}`
                          : ''}
                      </span>
                    </span>
                    <Button
                      disabled={documents.busy}
                      onClick={() => void remove(share.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
