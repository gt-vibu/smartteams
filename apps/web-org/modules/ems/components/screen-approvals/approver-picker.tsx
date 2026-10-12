'use client';
import { approverSearchSchema } from '@smarteam/contracts';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@smarteam/ui';
import { Check, ChevronDown, Search } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

export function ApproverPicker({
  value,
  onChange,
  disabled,
  label = 'Approver',
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { session } = useSession();
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const [cursor, setCursor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => setCursor(null), [term]);
  const resource = useAsyncResource(
    async () => {
      const query = new URLSearchParams(open ? { search: term } : { userId: value });
      if (open && cursor) query.set('cursor', cursor);
      return approverSearchSchema.parse(
        await apiRequest(
          orgPath(session!.organizationId, `/approval-policies/approver-search?${query}`),
          { method: 'GET' },
        ),
      );
    },
    [session?.organizationId, open, term, cursor, value],
    {
      enabled: Boolean(session?.organizationId) && (open ? term === search.trim() : Boolean(value)),
    },
  );
  const person = resource.data?.items.find((row) => row.userId === value);
  const caption =
    selected?.id === value
      ? selected.label
      : person
        ? `${person.name} · ${person.employeeNumber}`
        : value
          ? 'Selected approver'
          : 'Choose a person';
  const people = resource.data?.items ?? [];

  const choose = (row: (typeof people)[number]) => {
    setSelected({ id: row.userId, label: `${row.name} · ${row.employeeNumber}` });
    onChange(row.userId);
    setOpen(false);
    setSearch('');
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (people.length) setActiveIndex((index) => Math.min(index + 1, people.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && people[activeIndex]) {
      event.preventDefault();
      choose(people[activeIndex]);
    }
  };

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        setActiveIndex(0);
        if (!next) {
          setSearch('');
          setCursor(null);
        }
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <button
          aria-controls={listId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          role="combobox"
          type="button"
        >
          <span
            className={`min-w-0 truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {caption}
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
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
            aria-activedescendant={people[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-controls={listId}
            aria-label={`Search ${label}`}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            maxLength={100}
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search by name or employee ID"
            ref={searchRef}
            value={search}
          />
        </div>
        <ul className="max-h-64 overflow-y-auto py-1" id={listId} role="listbox">
          {resource.loading && (
            <li className="px-3 py-2 text-xs text-muted-foreground" role="status">
              Searching…
            </li>
          )}
          {resource.error && (
            <li className="px-3 py-2 text-xs text-destructive" role="alert">
              {resource.error}
            </li>
          )}
          {!resource.loading && !resource.error && people.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No active approvers match.</li>
          )}
          {!resource.loading &&
            !resource.error &&
            people.map((row, index) => (
              <li
                aria-selected={row.userId === value}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                  index === activeIndex ? 'bg-muted' : 'hover:bg-muted/60'
                }`}
                id={`${listId}-${index}`}
                key={row.userId}
                onClick={() => choose(row)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
              >
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{row.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {row.employeeNumber}
                    {row.branchName ? ` · ${row.branchName}` : ''}
                  </span>
                </span>
                {row.userId === value && (
                  <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                )}
              </li>
            ))}
        </ul>
        {(cursor || resource.data?.nextCursor) && (
          <div className="flex items-center justify-between gap-2 border-t border-border p-2">
            {cursor ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={resource.loading}
                onClick={() => setCursor(null)}
              >
                First page
              </Button>
            ) : (
              <span />
            )}
            {resource.data?.nextCursor && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={resource.loading}
                onClick={() => setCursor(resource.data!.nextCursor)}
              >
                Next 50
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
