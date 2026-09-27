'use client';

import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import type { Employee } from '@smarteam/contracts';
import { EmployeeCombobox } from './employee-combobox';

/**
 * Who leads a project or a team, and — for someone who may change it — assigning, changing or
 * removing them. Either can be created before anyone leads it; this is where that gets done.
 */
export function LeadSection({
  kind,
  lead,
  employees,
  canWrite,
  busy,
  onSave,
}: {
  kind: 'project' | 'team';
  lead: { employeeId: string; displayName: string; employeeNumber: string } | null;
  employees: readonly Employee[];
  canWrite: boolean;
  busy: boolean;
  onSave: (employeeId: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState('');

  const save = async (employeeId: string | null) => {
    if (await onSave(employeeId)) setEditing(false);
  };

  return (
    <section className="space-y-2">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {kind === 'project' ? 'Project lead' : 'Team lead'}
      </span>
      {editing ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <EmployeeCombobox
            disabled={busy}
            employees={employees}
            excludeIds={lead ? [lead.employeeId] : []}
            id={`${kind}-lead-change`}
            onChange={setChoice}
            placeholder="Choose the lead"
            value={choice}
          />
          <div className="flex justify-end gap-2">
            <Button
              disabled={busy}
              onClick={() => setEditing(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !choice}
              onClick={() => void save(choice)}
              size="sm"
              type="button"
            >
              {lead ? 'Change lead' : 'Assign lead'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
          {lead ? (
            <span className="min-w-0 text-xs">
              <span className="font-semibold text-foreground">{lead.displayName}</span>
              <span className="text-muted-foreground"> · {lead.employeeNumber}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No lead yet.</span>
          )}
          {canWrite && (
            <span className="flex gap-1.5">
              <Button
                disabled={busy}
                onClick={() => {
                  setChoice('');
                  setEditing(true);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {lead ? 'Change' : 'Assign lead'}
              </Button>
              {lead && (
                <Button
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => void save(null)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              )}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
