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
  const resource = useAsyncResource(
    async () =>
      workforcePeopleSchema.parse(
        await apiRequest(
          orgPath(
            session!.organizationId,
            `/workforce/people?${new URLSearchParams({ search, ...(cursor ? { cursor } : {}) })}`,
          ),
          { method: 'GET' },
        ),
      ),
    [session?.organizationId, search, cursor],
    { enabled: open && Boolean(session?.organizationId) },
  );
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
          <ul className="max-h-48 overflow-y-auto">
            {resource.data?.items.map((person) => (
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
          </ul>
          {!resource.loading && !resource.data?.items.length && (
            <p className="text-xs">No matching active employees.</p>
          )}
          {resource.data?.nextCursor && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCursor(resource.data!.nextCursor)}
            >
              Next 50
            </Button>
          )}
          {cursor && (
            <Button type="button" size="sm" variant="outline" onClick={() => setCursor(null)}>
              First page
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
