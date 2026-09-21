'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@smarteam/ui';
import type { BranchMembership } from '@smarteam/contracts';
import { useBranchMemberships } from '../../hooks/use-branch-memberships';
import { BranchChangeForm, type BranchChange } from './employee-branch-form';

const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());

const span = (row: BranchMembership) =>
  row.endsOn ? `${row.startsOn} – ${row.endsOn}` : `since ${row.startsOn}`;

/**
 * Where an employee belongs: one primary branch, any additional ones, and the history of both.
 *
 * Adding a branch and moving the primary are separate on purpose. Moving the primary is a
 * transfer — the old one ends the day before the new one starts and stays on record — so it is
 * never a dropdown quietly overwritten.
 */
export function EmployeeBranchesSection({
  employeeId,
  readOnly,
}: {
  employeeId: string;
  readOnly: boolean;
}) {
  const state = useBranchMemberships(employeeId);
  const [open, setOpen] = useState<BranchChange | null>(null);
  const [showPast, setShowPast] = useState(false);
  if (!state.canRead) return null;
  const canWrite = !readOnly && state.canWrite;

  const primary = state.rows.find(
    (row) => row.relationship === 'PRIMARY' && row.state === 'ACTIVE',
  );
  const scheduled = state.rows.find(
    (row) => row.relationship === 'PRIMARY' && row.state === 'UPCOMING',
  );
  const additional = state.rows.filter(
    (row) => row.relationship === 'ADDITIONAL' && row.state !== 'ENDED',
  );
  const past = state.rows.filter((row) => row.state === 'ENDED');
  const heldIds = new Set(
    state.rows.filter((row) => row.state !== 'ENDED').map((row) => row.branchId),
  );

  const act = async (change: () => Promise<boolean>) => {
    if (await change()) setOpen(null);
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Branches
        </h3>
        {canWrite && !open && (
          <div className="flex gap-2">
            <Button onClick={() => setOpen('add')} size="sm" type="button" variant="outline">
              Add branch
            </Button>
            {!scheduled && (
              <Button onClick={() => setOpen('transfer')} size="sm" type="button" variant="outline">
                Transfer primary
              </Button>
            )}
          </div>
        )}
      </div>

      {state.loading ? (
        <p className="text-muted-foreground" role="status">
          Loading…
        </p>
      ) : state.loadError ? (
        <p className="text-destructive" role="alert">
          {state.loadError}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {primary ? (
            <Row badge="Primary" row={primary} />
          ) : (
            <li className="text-muted-foreground">No primary branch.</li>
          )}
          {scheduled && (
            <Row
              action={
                canWrite ? (
                  <Button
                    disabled={state.busy}
                    onClick={() => void act(() => state.cancel(scheduled.id))}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel transfer
                  </Button>
                ) : null
              }
              badge={`Moves here on ${scheduled.startsOn}`}
              row={scheduled}
            />
          )}
          {additional.map((row) => (
            <Row
              action={
                canWrite ? (
                  row.state === 'UPCOMING' ? (
                    <Button
                      disabled={state.busy}
                      onClick={() => void act(() => state.cancel(row.id))}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      disabled={state.busy}
                      onClick={() => void act(() => state.end(row.id, today()))}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      End today
                    </Button>
                  )
                ) : null
              }
              badge={row.state === 'UPCOMING' ? 'Upcoming' : 'Additional'}
              key={row.id}
              row={row}
            />
          ))}
        </ul>
      )}

      {open && (
        <BranchChangeForm
          branches={state.branches.filter((branch) =>
            open === 'transfer' ? branch.id !== primary?.branchId : !heldIds.has(branch.id),
          )}
          busy={state.busy}
          error={state.error}
          kind={open}
          onCancel={() => {
            state.clearError();
            setOpen(null);
          }}
          onSubmit={(input) =>
            void act(() =>
              open === 'transfer'
                ? state.transfer({ branchId: input.branchId, effectiveFrom: input.from })
                : state.add({
                    branchId: input.branchId,
                    startsOn: input.from,
                    ...(input.until ? { endsOn: input.until } : {}),
                  }),
            )
          }
        />
      )}
      {!open && state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}

      {past.length > 0 && (
        <div>
          <button
            className="text-[11px] font-semibold text-primary"
            onClick={() => setShowPast((value) => !value)}
            type="button"
          >
            {showPast ? 'Hide' : 'Show'} branch history ({past.length})
          </button>
          {showPast && (
            <ul className="mt-1.5 space-y-1">
              {past.map((row) => (
                <li
                  className="flex justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5"
                  key={row.id}
                >
                  <span className="truncate font-semibold text-foreground">{row.branchName}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {row.relationship === 'PRIMARY' ? 'Primary' : 'Additional'} · {span(row)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Row({
  row,
  badge,
  action,
}: {
  row: BranchMembership;
  badge: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      <span className="min-w-0">
        <span className="font-semibold text-foreground">{row.branchName ?? 'Branch'}</span>
        <span className="text-muted-foreground"> · {span(row)}</span>
      </span>
      <span className="flex items-center gap-2">
        <Badge
          className="text-[10px]"
          variant={row.relationship === 'PRIMARY' ? 'secondary' : 'outline'}
        >
          {badge}
        </Badge>
        {action}
      </span>
    </li>
  );
}
