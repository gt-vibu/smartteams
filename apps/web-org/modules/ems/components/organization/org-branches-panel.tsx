'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@smarteam/ui';
import { MoreHorizontal } from 'lucide-react';
import type { Branch } from '@smarteam/contracts';
import type { OrganizationState } from '../../hooks/use-organization';
import { Unavailable } from './org-profile-panel';
import { BranchSettingsDrawer } from './branch-settings-drawer';
import { LIMITS, codeProblem, textProblem } from '@smarteam/contracts';
import { captureAttendanceLocation } from '../../services/attendance-location';

/**
 * Branches.
 *
 * The full lifecycle is backed: list, create, update and retire, all tenant-scoped and authorised
 * server-side. The screen this replaced kept branches in `localStorage`, so a branch created by
 * one administrator did not exist for anyone else — including for the employee assignment and
 * attendance scoping that genuinely depend on it.
 */
export function OrgBranchesPanel({ organization: state }: { organization: OrganizationState }) {
  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<Branch | null>(null);
  const [settings, setSettings] = useState<Branch | null>(null);
  const activeCount = state.branches.filter((branch) => branch.status !== 'DEACTIVATED').length;

  if (state.branchesForbidden) {
    return <Unavailable detail="You do not have permission to view branches." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/70 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Branches</h2>
          <p className="mt-0.5 max-w-[60ch] text-[13px] leading-5 text-muted-foreground">
            Set the locations employees belong to and use for attendance and shifts.
          </p>
        </div>
        {state.can.writeBranches && (
          <Button onClick={() => setCreating(true)} type="button">
            Add branch
          </Button>
        )}
      </div>

      {state.saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {state.saveError}
        </p>
      )}

      {state.loading && (
        <div
          aria-label="Loading branches"
          className="space-y-2 rounded-xl border border-border bg-card p-4"
          role="status"
        >
          {[0, 1, 2].map((row) => (
            <div className="h-10 animate-pulse rounded-md bg-muted/80" key={row} />
          ))}
        </div>
      )}

      {!state.loading && !state.error && state.branches.length === 0 && (
        <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-bold text-foreground">No branches</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one to scope employees and attendance by location.
          </p>
        </div>
      )}

      {!state.loading && !state.error && state.branches.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="stack-table w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-border bg-table-header">
              <tr className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.branches.map((branch) => {
                // "Primary" only means something when there is more than one to choose from.
                const choosing = activeCount > 1;
                const isPrimary = choosing && branch.id === state.primaryBranchId;
                return (
                  <tr
                    className="border-b border-border/80 transition-colors last:border-0 hover:bg-muted/40"
                    key={branch.id}
                  >
                    <td data-cell="primary" className="px-4 py-3 font-medium text-foreground">
                      {branch.name}
                      {isPrimary && (
                        <Badge className="ml-2" variant="sky">
                          Primary
                        </Badge>
                      )}
                    </td>
                    <td data-label="Code" className="px-4 py-3 font-mono text-muted-foreground">
                      {branch.code}
                    </td>
                    <td data-cell="status" data-label="Status" className="px-4 py-3">
                      <Badge variant={branch.status === 'DEACTIVATED' ? 'secondary' : 'success'}>
                        {branch.status === 'DEACTIVATED' ? 'Inactive' : 'Active'}
                      </Badge>
                    </td>
                    <td data-cell="actions" className="px-4 py-3 text-right">
                      {branch.status !== 'DEACTIVATED' && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={() => setSettings(branch)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Settings
                          </Button>
                          {state.can.writeBranches && (
                            <>
                              <Button
                                onClick={() => setEditing(branch)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Edit
                              </Button>
                              {!isPrimary && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      aria-label={`More actions for ${branch.name}`}
                                      className="size-8 px-0"
                                      size="icon"
                                      type="button"
                                      variant="ghost"
                                    >
                                      <MoreHorizontal aria-hidden="true" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {choosing && (
                                      <DropdownMenuItem
                                        disabled={state.saving}
                                        onSelect={() => void state.setPrimaryBranch(branch.id)}
                                      >
                                        Set as primary location
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={() => setRetiring(branch)}
                                    >
                                      Deactivate branch
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {settings && (
        <BranchSettingsDrawer
          branch={settings}
          onClose={() => setSettings(null)}
          onSaved={() => void state.refetch()}
        />
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        Open a branch's Settings to see how many current employees are based there.
        {activeCount > 1 &&
          ' New employees are placed in the primary branch unless you choose another.'}
      </p>

      <BranchDialog
        branch={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        open={creating || editing !== null}
        state={state}
      />
      <RetireBranchDialog
        branch={retiring}
        onOpenChange={(open) => !open && setRetiring(null)}
        open={retiring !== null}
        state={state}
      />
    </div>
  );
}

function BranchDialog({
  state,
  branch,
  open,
  onOpenChange,
}: {
  state: OrganizationState;
  branch: Branch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [locationMode, setLocationMode] = useState<'UNSET' | 'CURRENT' | 'MANUAL'>('UNSET');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [problem, setProblem] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(branch?.name ?? '');
    setCode(branch?.code ?? '');
    setLocationMode('UNSET');
    setLatitude('');
    setLongitude('');
    setProblem('');
  }, [branch, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2 || !code.trim()) {
      setProblem(
        name.trim().length < 2 ? 'Enter a branch name of at least 2 characters.' : 'Enter a code.',
      );
      return;
    }
    if (!branch && locationMode !== 'UNSET') {
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (
        !latitude.trim() ||
        !longitude.trim() ||
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lon) ||
        lon < -180 ||
        lon > 180
      ) {
        setProblem('Enter valid latitude and longitude, or remove the location setup.');
        return;
      }
    }
    setProblem('');
    const input = {
      name: name.trim(),
      code: code.trim(),
      ...(!branch && locationMode !== 'UNSET'
        ? { workLocation: { latitude: Number(latitude), longitude: Number(longitude) } }
        : {}),
    };
    const ok = branch
      ? await state.updateBranch(branch.id, input)
      : await state.createBranch(input);
    if (ok) onOpenChange(false);
  };

  const captureLocation = async () => {
    setCapturingLocation(true);
    setProblem('');
    try {
      const position = await captureAttendanceLocation();
      setLatitude(String(position.latitude));
      setLongitude(String(position.longitude));
      setLocationMode('CURRENT');
    } catch (caught) {
      setProblem(
        caught instanceof Error ? caught.message : 'Could not get this device’s location.',
      );
    } finally {
      setCapturingLocation(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          if (!branch) return;
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogTitle ref={titleRef} tabIndex={branch ? -1 : undefined}>
          {branch ? 'Edit branch' : 'New branch'}
        </DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label className="mb-1 block" htmlFor="branch-name">
              Name
            </Label>
            <Input
              maxLength={LIMITS.title}
              problem={textProblem(name, 'Branch name', LIMITS.title, 2)}
              disabled={state.saving}
              id="branch-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          {!branch && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Branch location (optional)</p>
                <p className="text-xs text-muted-foreground">
                  Add it now for attendance geofencing, or set it later in branch settings.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={state.saving || capturingLocation}
                  onClick={() => void captureLocation()}
                  type="button"
                  variant={locationMode === 'CURRENT' ? 'default' : 'outline'}
                >
                  {capturingLocation ? 'Getting location…' : 'Use this device’s current location'}
                </Button>
                <Button
                  disabled={state.saving}
                  onClick={() => setLocationMode('MANUAL')}
                  type="button"
                  variant={locationMode === 'MANUAL' ? 'default' : 'outline'}
                >
                  Enter coordinates manually
                </Button>
              </div>
              {locationMode !== 'UNSET' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    aria-label="Branch latitude"
                    inputMode="decimal"
                    max={90}
                    min={-90}
                    onChange={(event) => setLatitude(event.target.value)}
                    placeholder="Latitude (−90 to 90)"
                    type="number"
                    value={latitude}
                  />
                  <Input
                    aria-label="Branch longitude"
                    inputMode="decimal"
                    max={180}
                    min={-180}
                    onChange={(event) => setLongitude(event.target.value)}
                    placeholder="Longitude (−180 to 180)"
                    type="number"
                    value={longitude}
                  />
                </div>
              )}
            </div>
          )}
          <div>
            <Label className="mb-1 block" htmlFor="branch-code">
              Code
            </Label>
            <Input
              maxLength={LIMITS.code}
              problem={codeProblem(code, 'Branch code', LIMITS.code)}
              disabled={state.saving}
              id="branch-code"
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </div>
          {(problem || state.saveError) && (
            <p className="text-xs text-destructive" role="alert">
              {problem || state.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={state.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={state.saving} type="submit">
              {state.saving ? 'Saving…' : branch ? 'Save' : 'Create branch'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetireBranchDialog({
  state,
  branch,
  open,
  onOpenChange,
}: {
  state: OrganizationState;
  branch: Branch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branch) return;
    const ok = await state.retireBranch(branch.id, 'Branch deactivated');
    if (ok) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Deactivate {branch?.name ?? 'branch'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          {state.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {state.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={state.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={state.saving} type="submit">
              {state.saving ? 'Deactivating…' : 'Deactivate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
