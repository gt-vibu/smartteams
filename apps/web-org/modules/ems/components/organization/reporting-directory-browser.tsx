'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Users } from 'lucide-react';
import { LoadingIndicator, Button, Input } from '@smarteam/ui';
import { employeeDisplayName } from '@smarteam/contracts';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import { PersonAvatar } from '../common/person-avatar';

type Manager = { id: string; name: string };

/** Browse one manager's reports at a time; every level uses a bounded server cursor page. */
export function ReportingDirectoryBrowser() {
  const [path, setPath] = useState<Manager[]>([]);
  const [search, setSearch] = useState('');
  const manager = path.at(-1);
  const directory = useEmployeeDirectory(
    { reportingManager: manager?.id ?? 'ROOT', search },
    true,
  );

  return (
    <section aria-label="Reporting lines" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {path.length > 0 && (
          <Button
            aria-label={`Back to ${path.length > 1 ? path[path.length - 2]?.name : 'top level'}`}
            onClick={() => setPath((current) => current.slice(0, -1))}
            size="sm"
            type="button"
            variant="outline"
          >
            <ArrowLeft aria-hidden="true" className="mr-1 h-3 w-3" />
            Back
          </Button>
        )}
        <p aria-live="polite" className="min-w-0 flex-1 text-xs text-muted-foreground">
          {manager ? `Direct reports to ${manager.name}` : 'Top-level employees'}
          {directory.entries.length > 0 ? ` · ${directory.entries.length} on this page` : ''}
        </p>
      </div>
      <Input
        aria-label="Search reporting lines"
        maxLength={100}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Find a person in this reporting level"
        value={search}
      />
      {directory.loading && <LoadingIndicator variant="panel" label="Loading reporting lines" className="py-8 text-center text-xs text-muted-foreground" />}
      {directory.error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive">{directory.error}</p>}
      {!directory.loading && !directory.error && directory.entries.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          {manager ? 'No direct reports are recorded for this manager.' : 'No top-level employees found.'}
        </p>
      )}
      {directory.entries.length > 0 && (
        <ul className="space-y-2" aria-label="People at this reporting level">
          {directory.entries.map((employee) => {
            const name = employeeDisplayName(employee);
            return (
              <li key={employee.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <PersonAvatar name={name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {employee.jobTitle ?? 'No job title'}{employee.department ? ` · ${employee.department}` : ''}
                  </p>
                </div>
                {(employee.directReportsCount ?? 0) > 0 && (
                  <Button
                    aria-label={`View ${employee.directReportsCount} ${employee.directReportsCount === 1 ? 'report' : 'reports'} for ${name}`}
                    onClick={() => setPath((current) => [...current, { id: employee.id, name }])}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Users aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                    {employee.directReportsCount} {employee.directReportsCount === 1 ? 'report' : 'reports'}
                    <ArrowRight aria-hidden="true" className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-[11px] text-muted-foreground">Page {directory.paging.page}</span>
        <div className="flex gap-2">
          <Button disabled={directory.paging.page <= 1 || directory.loading} onClick={directory.paging.previous} size="sm" type="button" variant="outline">Previous</Button>
          <Button disabled={!directory.nextCursor || directory.loading} onClick={() => directory.nextCursor && directory.paging.next(directory.nextCursor)} size="sm" type="button" variant="outline">Next</Button>
        </div>
      </div>
    </section>
  );
}
