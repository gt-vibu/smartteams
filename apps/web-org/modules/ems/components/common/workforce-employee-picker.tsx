'use client';
import { workforcePeopleSchema } from '@smarteam/contracts';
import { Button, Input } from '@smarteam/ui';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

export function WorkforceEmployeePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const { session } = useSession();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query.trim());
  const [cursor, setCursor] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => setCursor(null), [search]);
  const searchKey = JSON.stringify([session?.organizationId, search]);
  const resource = useAsyncResource(
    async () => {
      const result = workforcePeopleSchema.parse(
        await apiRequest(
          orgPath(
            session!.organizationId,
            `/workforce/people?${new URLSearchParams({ search, ...(cursor ? { cursor } : {}) })}`,
          ),
          { method: 'GET' },
        ),
      );
      return { ...result, searchKey: open ? searchKey : null };
    },
    [session?.organizationId, search, cursor],
    { enabled: open && Boolean(session?.organizationId) },
  );
  const [loaded, setLoaded] = useState<{
    key: string;
    items: NonNullable<typeof resource.data>['items'];
  }>({ key: searchKey, items: [] });
  const accumulated = loaded.key === searchKey ? loaded.items : [];
  useEffect(() => {
    const result = resource.data;
    if (!open || !result || result.searchKey !== searchKey) return;
    setLoaded((previous) => {
      const existing = previous.key === searchKey ? previous.items : [];
      const seen = new Set(existing.map((person) => person.id));
      return {
        key: searchKey,
        items: [...existing, ...result.items.filter((person) => !seen.has(person.id))],
      };
    });
  }, [open, resource.data, searchKey]);
  const people = open ? accumulated : (resource.data?.items ?? []);
  return (
    <div
      className="space-y-2"
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <Button
        type="button"
        variant="outline"
        aria-label="Reporting manager"
        ref={trigger}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="h-auto w-full justify-start whitespace-normal"
      >
        {chosen?.id === value ? chosen.name : 'Choose a reporting manager'}
      </Button>
      {open && (
        <div className="space-y-2 rounded border p-2">
          <Input
            autoFocus
            aria-label="Search reporting managers"
            placeholder="Name or employee ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {resource.loading && (
            <p role="status" className="text-xs">
              Searching…
            </p>
          )}
          {resource.error && (
            <p role="alert" className="text-xs text-destructive">
              {resource.error}
            </p>
          )}
          <ul
            className="max-h-48 overscroll-contain overflow-y-auto"
            onScroll={(event) => {
              const list = event.currentTarget;
              const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 48;
              if (nearBottom && resource.data?.nextCursor && !resource.loading) {
                setCursor(resource.data.nextCursor);
              }
            }}
          >
            {people.map((person) => (
              <li key={person.id}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={resource.loading}
                  className="h-auto w-full justify-start whitespace-normal text-left text-xs"
                  onClick={() => {
                    setChosen({ id: person.id, name: `${person.name} · ${person.employeeNumber}` });
                    onChange(person.id);
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                >
                  {person.name} · {person.employeeNumber}
                </Button>
              </li>
            ))}
            {resource.loading && people.length > 0 && (
              <li className="p-2 text-center text-xs text-muted-foreground" role="status">
                Loading more employees…
              </li>
            )}
          </ul>
          {!resource.loading && !people.length && (
            <p className="text-xs">No matching active employees.</p>
          )}
        </div>
      )}
    </div>
  );
}
