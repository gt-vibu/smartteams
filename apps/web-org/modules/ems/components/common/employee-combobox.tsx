'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import { LoadingIndicator, Button, Popover, PopoverContent, PopoverTrigger } from '@smarteam/ui';
import { employeeDisplayName } from '@smarteam/contracts';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEmployeeSearch } from '../../hooks/use-employee-search';
import { activeByName } from '../../lib/pickable';

type Person = Parameters<typeof employeeDisplayName>[0] & {
  id: string;
  employeeNumber?: string | null;
  status?: string | null;
  workEmail?: string | null;
};

/**
 * Picks one employee, with the search inside the dropdown rather than beside it.
 *
 * Current employees only, A to Z, matched on name, employee ID or email. `excludeIds` keeps out
 * people who cannot be chosen here — the members of a team when choosing its lead, say — so the
 * list never offers a choice the form would then have to reject.
 */
export function EmployeeCombobox<T extends Person>({
  employees,
  value,
  onChange,
  excludeIds = [],
  placeholder = 'Choose an employee',
  noneLabel,
  disabled = false,
  id,
}: {
  employees: readonly T[];
  value: string;
  onChange: (employeeId: string) => void;
  excludeIds?: readonly string[];
  placeholder?: string;
  /** Offers a "nobody" choice with this label, for an optional field. */
  noneLabel?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const remote = useEmployeeSearch(query, open && !disabled, value ? [value] : []);
  const source: readonly Person[] = remote.remote ? remote.employees : employees;
  const chosen = [...remote.selectedEmployees, ...source, ...employees].find(
    (employee) => employee.id === value,
  );
  const options = useMemo(() => {
    const excluded = new Set(excludeIds);
    const term = query.trim().toLowerCase();
    const people = activeByName(source.filter((employee) => !excluded.has(employee.id)));
    const matches =
      term && !remote.remote
        ? people.filter(
            (employee) =>
              employeeDisplayName(employee).toLowerCase().includes(term) ||
              (employee.employeeNumber ?? '').toLowerCase().includes(term) ||
              (employee.workEmail ?? '').toLowerCase().includes(term),
          )
        : people;
    return [
      ...(noneLabel && !term ? [{ id: '', label: noneLabel, detail: '' }] : []),
      ...matches.map((employee) => ({
        id: employee.id,
        label: employeeDisplayName(employee),
        detail: employee.employeeNumber ?? '',
      })),
    ];
  }, [source, excludeIds, query, noneLabel, remote.remote]);

  const pick = (employeeId: string) => {
    onChange(employeeId);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[cursor];
      if (option) pick(option.id);
    }
  };

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        setCursor(0);
        if (!next) setQuery('');
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <button
          aria-controls={listId}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          id={id}
          role="combobox"
          type="button"
        >
          <span className={`truncate ${chosen ? 'text-foreground' : 'text-muted-foreground'}`}>
            {chosen
              ? `${employeeDisplayName(chosen)}${chosen.employeeNumber ? ` · ${chosen.employeeNumber}` : ''}`
              : value === '' && noneLabel
                ? noneLabel
                : placeholder}
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            aria-activedescendant={options[cursor] ? `${listId}-${cursor}` : undefined}
            aria-controls={listId}
            aria-label="Search employees"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            maxLength={100}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search by name, ID or email"
            ref={searchRef}
            value={query}
          />
        </div>
        <ul
          className="max-h-64 overflow-y-auto overscroll-contain py-1"
          id={listId}
          onScroll={(event) => {
            const list = event.currentTarget;
            const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 48;
            if (nearBottom && remote.nextCursor && !remote.loadingMore) {
              remote.paging.next(remote.nextCursor);
            }
          }}
          role="listbox"
        >
          {remote.loading && options.length === 0 ? (
            <li role="none" className="px-3 py-2 text-xs">
              <LoadingIndicator variant="inline" label="Loading employees" />
            </li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">No one matches.</li>
          ) : (
            options.map((option, index) => (
              <li
                aria-selected={option.id === value}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                  index === cursor ? 'bg-muted' : ''
                }`}
                id={`${listId}-${index}`}
                key={option.id || 'none'}
                onClick={() => pick(option.id)}
                onMouseEnter={() => setCursor(index)}
                role="option"
              >
                <span className="min-w-0">
                  <span
                    className={`block truncate ${option.id ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {option.label}
                  </span>
                  {option.detail && (
                    <span className="block text-[11px] text-muted-foreground">{option.detail}</span>
                  )}
                </span>
                {option.id === value && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
              </li>
            ))
          )}
          {remote.loadingMore && options.length > 0 && (
            <li role="none" className="px-3 py-2 text-center text-xs text-muted-foreground">
              Loading more employees…
            </li>
          )}
        </ul>
        {remote.error && (
          <p role="alert" className="px-3 py-2 text-xs text-destructive">
            {remote.error}{' '}
            <Button size="sm" variant="outline" onClick={() => void remote.refetch()}>
              Try again
            </Button>
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
