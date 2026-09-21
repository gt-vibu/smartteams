'use client';

import React, { useMemo, useState } from 'react';
import { Input } from '@smarteam/ui';
import { employeeDisplayName } from '@smarteam/contracts';
import { Search } from 'lucide-react';
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
  const candidates = useMemo(() => {
    const excluded = new Set(excludeIds);
    const term = query.trim().toLowerCase();
    return activeByName(employees.filter((e) => !excluded.has(e.id))).filter(
      (e) =>
        !term ||
        employeeDisplayName(e).toLowerCase().includes(term) ||
        (e.employeeNumber ?? '').toLowerCase().includes(term) ||
        (e.workEmail ?? '').toLowerCase().includes(term),
    );
  }, [employees, excludeIds, query]);

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
          className="pl-8"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, ID or email"
          value={query}
        />
      </div>
      <ul
        aria-multiselectable={multiple}
        className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-1"
        role="listbox"
      >
        {candidates.length === 0 ? (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">
            {query ? 'No one matches.' : 'Everyone is already here.'}
          </li>
        ) : (
          candidates.map((employee) => {
            const on = selected.includes(employee.id);
            return (
              <li aria-selected={on} key={employee.id} role="option">
                <button
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    on ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60'
                  }`}
                  disabled={disabled}
                  onClick={() => toggle(employee.id)}
                  type="button"
                >
                  <input
                    aria-hidden="true"
                    checked={on}
                    readOnly
                    tabIndex={-1}
                    type={multiple ? 'checkbox' : 'radio'}
                  />
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
      {multiple && selected.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{selected.length} selected</p>
      )}
    </div>
  );
}
