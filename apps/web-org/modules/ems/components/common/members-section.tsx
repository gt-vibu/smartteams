'use client';

import { formatDate } from '@smarteam/contracts';
import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import type { PicklistKind } from '../../hooks/use-picklist';
import type { MemberView } from '../../services/team-directory';
import { PicklistSelect } from './picklist-select';

/** Opens the employee's profile: the Employees module with that person selected. */
export function openEmployeeProfile(employeeId: string) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('space', 'organization');
  url.searchParams.set('module', 'employees');
  url.searchParams.set('employee', employeeId);
  window.history.pushState(window.history.state, '', url);
  // The workspace and the Employees screen both follow the URL on popstate.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * The members of a project or a team, the same way on both: who is on it now with their role and
 * start date, and who was on it before. A current member's role can be changed and their
 * membership ended; ending keeps the row as history, and nobody's employee record is touched.
 */
export function MembersSection({
  members,
  pastMembers,
  roleKind,
  canWrite,
  canViewEmployee,
  busy,
  onChangeRole,
  onEnd,
  onAdd,
  leadEmployeeId,
}: {
  /** The lead, when they also work as a member: marked, so the two roles read as one person's. */
  leadEmployeeId?: string | null;
  members: readonly MemberView[];
  pastMembers: readonly MemberView[];
  roleKind: PicklistKind;
  canWrite: boolean;
  canViewEmployee: boolean;
  busy: boolean;
  onChangeRole: (memberId: string, role: string) => Promise<boolean>;
  onEnd: (memberId: string) => Promise<boolean>;
  onAdd: () => void;
}) {
  const [editing, setEditing] = useState<{ memberId: string; role: string } | null>(null);
  const [showPast, setShowPast] = useState(false);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Members ({members.length})
        </span>
        {canWrite && (
          <Button disabled={busy} onClick={onAdd} size="sm" type="button" variant="outline">
            + Add members
          </Button>
        )}
      </div>
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody is a member yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {members.map((member) => (
            <li className="rounded-md border border-border bg-card px-3 py-2" key={member.memberId}>
              <div className="flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {member.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {member.displayName}
                    </span>
                    {leadEmployeeId && member.employeeId === leadEmployeeId && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-primary dark:bg-emerald-400/15 dark:text-emerald-200">
                        Lead
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {member.role ?? 'No role'} · since {formatDate(member.since)}
                    {member.until ? ` · until ${formatDate(member.until)}` : ''}
                  </span>
                </span>
              </div>
              {editing?.memberId === member.memberId ? (
                <div className="mt-2 space-y-2">
                  <PicklistSelect
                    addLabel="+ Add a role"
                    kind={roleKind}
                    noneLabel="No role"
                    onChange={(role) => setEditing({ memberId: member.memberId, role })}
                    value={editing.role}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => setEditing(null)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void onChangeRole(member.memberId, editing.role).then(
                          (ok) => ok && setEditing(null),
                        )
                      }
                      size="sm"
                      type="button"
                    >
                      Save role
                    </Button>
                  </div>
                </div>
              ) : (
                (canWrite || canViewEmployee) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {canViewEmployee && (
                      <Button
                        onClick={() => openEmployeeProfile(member.employeeId)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        View employee
                      </Button>
                    )}
                    {canWrite && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setEditing({ memberId: member.memberId, role: member.role ?? '' })
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Change role
                      </Button>
                    )}
                    {/* A membership with an end date is already closed on the server, which
                        refuses a second ending. Someone leaving on a future date stays listed
                        here until that day, but cannot be ended twice. */}
                    {canWrite && !member.until && (
                      <Button
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => void onEnd(member.memberId)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        End membership
                      </Button>
                    )}
                    {canWrite && member.until && (
                      <span className="self-center px-2 text-[11px] font-semibold text-muted-foreground">
                        Leaves {formatDate(member.until)}
                      </span>
                    )}
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {pastMembers.length > 0 && (
        <div>
          <button
            className="text-[11px] font-semibold text-primary"
            onClick={() => setShowPast((open) => !open)}
            type="button"
          >
            {showPast ? 'Hide' : 'Show'} past members ({pastMembers.length})
          </button>
          {showPast && (
            <ul className="mt-1.5 space-y-1">
              {pastMembers.map((member) => (
                <li
                  className="flex justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-[11px]"
                  key={member.memberId}
                >
                  <span className="truncate font-semibold text-foreground">
                    {member.displayName}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {member.role ?? 'No role'} · {formatDate(member.since)} to{' '}
                    {formatDate(member.until)}
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
