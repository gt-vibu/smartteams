'use client';

import React, { useState } from 'react';
import { LoadingIndicator, Badge, Button, Input } from '@smarteam/ui';
import {
  PICKLIST_META,
  usePicklist,
  type PicklistEntry,
  type PicklistKind,
} from '../../hooks/use-picklist';

const KINDS: PicklistKind[] = ['job-titles', 'team-roles'];
const SECTION_LABELS: Record<PicklistKind, string> = {
  'job-titles': 'Job titles',
  'team-roles': 'Team responsibilities',
};
const SECTION_HELP: Record<PicklistKind, string> = {
  'job-titles':
    'Job titles describe a person’s position. They do not grant access or change permissions.',
  'team-roles':
    'These responsibilities apply only to team membership, such as Team Lead or Team Member.',
};

/**
 * Job architecture and scoped work responsibilities. Access profiles live in Access & Permissions;
 * neither a job title nor a team/project responsibility grants organization-wide permissions.
 */
export function OrgListsPanel() {
  const [kind, setKind] = useState<PicklistKind>('job-titles');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5"
          role="tablist"
        >
          {KINDS.map((id) => (
            <Button
              aria-selected={kind === id}
              className={`h-auto rounded-md px-3 py-1.5 text-xs font-semibold ${
                kind === id
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'bg-card/50 text-foreground/75 hover:bg-card hover:text-foreground'
              }`}
              key={id}
              onClick={() => setKind(id)}
              role="tab"
              size="sm"
              type="button"
              variant="ghost"
            >
              {SECTION_LABELS[id]}
            </Button>
          ))}
        </div>
      </div>
      <ListEditor key={kind} kind={kind} />
      {kind === 'job-titles' && (
        <p className="max-w-2xl text-xs text-muted-foreground">
          Project assignments display each employee’s current job title. Update it on the employee’s
          profile to keep the role consistent across projects.
        </p>
      )}
    </div>
  );
}

function ListEditor({ kind }: { kind: PicklistKind }) {
  const list = usePicklist(kind);
  const meta = PICKLIST_META[kind];
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const rows = list.entries.filter((entry) => showArchived || !entry.archived);
  const archivedCount = list.entries.filter((entry) => entry.archived).length;

  const add = async () => {
    if ((await list.add(draft)) !== null) setDraft('');
  };

  return (
    <section className="space-y-3">
      <p className="max-w-2xl text-xs text-muted-foreground">{SECTION_HELP[kind]}</p>
      {list.canAdd && (
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-sm"
            maxLength={80}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add();
            }}
            placeholder={`New ${meta.singular}`}
            value={draft}
          />
          <Button
            disabled={list.saving || draft.trim().length < 2}
            onClick={() => void add()}
            size="sm"
            type="button"
          >
            Add
          </Button>
        </div>
      )}
      {list.error && (
        <p className="text-xs text-destructive" role="alert">
          {list.error}
        </p>
      )}
      {archivedCount > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            type="checkbox"
          />
          Show archived ({archivedCount})
        </label>
      )}
      {list.loading ? (
        <LoadingIndicator variant="inline" label="Preparing content" className="text-xs text-muted-foreground" />
      ) : list.loadError ? (
        <p className="text-xs text-destructive" role="alert">
          {list.loadError}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="stack-table w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-bold">Name</th>
                <th className="px-4 py-2 font-bold">Status</th>
                <th className="px-4 py-2 font-bold">In use</th>
                {list.canAdd && <th className="px-4 py-2 font-bold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <Row
                  entry={entry}
                  key={entry.name}
                  list={list}
                  renaming={renaming?.from === entry.name ? renaming : null}
                  setRenaming={setRenaming}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        A {meta.singular} that has ever been used can be archived but not deleted or renamed:
        records that carry it keep showing it, and it is no longer offered for new ones.
      </p>
    </section>
  );
}

function Row({
  entry,
  list,
  renaming,
  setRenaming,
}: {
  entry: PicklistEntry;
  list: ReturnType<typeof usePicklist>;
  renaming: { from: string; to: string } | null;
  setRenaming: (value: { from: string; to: string } | null) => void;
}) {
  const unused = entry.usage.total === 0;
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2" data-cell="primary">
        {renaming ? (
          <div className="flex gap-2">
            <Input
              maxLength={80}
              onChange={(event) => setRenaming({ ...renaming, to: event.target.value })}
              value={renaming.to}
            />
            <Button
              disabled={list.saving || renaming.to.trim().length < 2}
              onClick={() =>
                void list.rename(entry.name, renaming.to).then((ok) => ok && setRenaming(null))
              }
              size="sm"
              type="button"
            >
              Save
            </Button>
            <Button onClick={() => setRenaming(null)} size="sm" type="button" variant="outline">
              Cancel
            </Button>
          </div>
        ) : null}
        {renaming && entry.usage.total > 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            The {entry.usage.total} record{entry.usage.total === 1 ? '' : 's'} using it are renamed
            too.
          </p>
        ) : renaming ? null : (
          <span className="font-semibold text-foreground">{entry.name}</span>
        )}
      </td>
      <td className="px-4 py-2" data-cell="status" data-label="Status">
        <Badge className="text-[10px]" variant="outline">
          {entry.archived ? 'Archived' : 'Active'}
        </Badge>
        {entry.standard && <span className="ml-2 text-[10px] text-muted-foreground">Standard</span>}
      </td>
      <td className="px-4 py-2 tabular-nums text-muted-foreground" data-label="In use">
        {entry.usage.active} current
        {entry.usage.total > entry.usage.active ? ` · ${entry.usage.total} ever` : ''}
      </td>
      {list.canAdd && (
        <td className="px-4 py-2" data-label="Actions">
          <div className="flex flex-wrap gap-1.5">
            {!renaming && (
              <Button
                onClick={() => setRenaming({ from: entry.name, to: entry.name })}
                size="sm"
                type="button"
                variant="outline"
              >
                Rename
              </Button>
            )}
            <Button
              disabled={list.saving}
              onClick={() =>
                void (entry.archived ? list.restore(entry.name) : list.archive(entry.name))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              {entry.archived ? 'Restore' : 'Archive'}
            </Button>
            {/* In use, it can only be archived: deleting would leave records naming nothing. */}
            <Button
              className="text-destructive"
              disabled={list.saving || !unused}
              onClick={() => void list.remove(entry.name)}
              size="sm"
              title={unused ? undefined : 'In use — archive it instead'}
              type="button"
              variant="outline"
            >
              Delete
            </Button>
          </div>
        </td>
      )}
    </tr>
  );
}
