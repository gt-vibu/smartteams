'use client';

import React, { useMemo, useState } from 'react';
import { LoadingIndicator, Button, Input } from '@smarteam/ui';
import { employeeDisplayName } from '@smarteam/contracts';
import { Search } from 'lucide-react';
import { useEmployeeSearch } from '../../hooks/use-employee-search';
import { CursorPageControls } from './cursor-page-controls';
import { activeByName } from '../../lib/pickable';

type Person = Parameters<typeof employeeDisplayName>[0] & {
  id: string;
  employeeNumber?: string | null;
  status?: string | null;
  workEmail?: string | null;
};

/**
 * The one employee chooser for adding people to things (projects, teams). Current employees only,
 * A to Z, searchable by name, ID or email, with those already on it left out. The list is whatever
 * the API returned for this viewer, so nobody they may not see is offered.
 */
export function EmployeePicker<T extends Person>({
  employees,
  excludeIds = [],
  selected,
  onChange,
  multiple = true,
  disabled = false,
}: {
  employees: readonly T[];
  excludeIds?: readonly string[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [requestedPage, setPage] = useState(0);
  const remote = useEmployeeSearch(query, !disabled, selected);
  const source: readonly Person[] = remote.remote ? remote.employees : employees;
  const candidates = useMemo(() => {
    const excluded = new Set(excludeIds);
    const term = query.trim().toLowerCase();
    return activeByName(source.filter((e) => !excluded.has(e.id))).filter(
      (e) =>
        remote.remote || !term ||
        employeeDisplayName(e).toLowerCase().includes(term) ||
        (e.employeeNumber ?? '').toLowerCase().includes(term) ||
        (e.workEmail ?? '').toLowerCase().includes(term),
    );
  }, [source, excludeIds, query, remote.remote]);
  const pages = Math.max(1, Math.ceil(candidates.length / 50));
  const page = Math.min(requestedPage, pages - 1);
  const visible = candidates.slice(page * 50, (page + 1) * 50);

  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search employees"
          maxLength={100}
          className="pl-8"
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Search by name, ID or email"
          value={query}
        />
      </div>
      <ul
        aria-label="Employee choices"
        aria-multiselectable={multiple}
        className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-1"
        role="listbox"
      >
        {remote.loading ? <li role="none" className="p-2 text-xs"><LoadingIndicator variant="inline" label="Loading employees" /></li> : candidates.length === 0 ? (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">
            {query ? 'No one matches.' : 'Everyone is already here.'}
          </li>
        ) : (
          visible.map((employee) => {
            const on = selected.includes(employee.id);
            return (
              <li key={employee.id} role="presentation">
                <button
                  aria-selected={on}
                  role="option"
                  onKeyDown={(event) => {
                    const choices = Array.from(
                      event.currentTarget
                        .closest('ul')!
                        .querySelectorAll<HTMLButtonElement>('button'),
                    );
                    const index = choices.indexOf(event.currentTarget);
                    const next =
                      event.key === 'ArrowDown'
                        ? Math.min(index + 1, choices.length - 1)
                        : event.key === 'ArrowUp'
                          ? Math.max(0, index - 1)
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? choices.length - 1
                              : undefined;
                    if (next !== undefined) {
                      event.preventDefault();
                      choices[next]?.focus();
                    }
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    on ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60'
                  }`}
                  disabled={disabled}
                  onClick={() => toggle(employee.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="w-4 shrink-0 text-center">
                    {on ? '✓' : '○'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {employeeDisplayName(employee)}
                  </span>
                  {employee.employeeNumber && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {employee.employeeNumber}
                    </span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
      {!remote.remote && pages > 1 && (
        <nav
          aria-label="Employee choice pages"
          className="flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span role="status">
            Page {page + 1} of {pages} · {candidates.length} matches
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous employees
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || page + 1 === pages}
              onClick={() => setPage(page + 1)}
            >
              Next employees
            </Button>
          </div>
        </nav>
      )}
      {remote.error && <p role="alert" className="text-xs text-destructive">{remote.error} <Button size="sm" variant="outline" onClick={() => void remote.refetch()}>Try again</Button></p>}
      {remote.remote && <CursorPageControls page={remote.paging.page} count={source.length} nextCursor={remote.nextCursor} busy={remote.loading} previous={remote.paging.previous} next={remote.paging.next} />}
      {multiple && selected.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{selected.length} selected</p>
      )}
    </div>
  );
}
