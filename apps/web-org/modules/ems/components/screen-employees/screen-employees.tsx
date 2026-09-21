'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Input,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { employeeDisplayName, employmentTypeLabel } from '@smarteam/contracts';
import { IdCard, Search } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { PageShell } from '../layout/page-shell';
import { PersonAvatar } from '../common/person-avatar';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import { EmployeeProfile } from './employee-profile';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { ListPager, PAGE_SIZE } from '../common/list-pager';

const ALL = '__all__';

/**
 * The employee directory: everyone in the organization, searchable and filterable. Choosing a
 * person opens their profile, where their details, payroll, attendance, leave, projects and
 * teams are viewed and edited in one place.
 */
export function ScreenEmployees() {
  const directory = useEmployeeDirectory();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState(ALL);
  // Current staff and those who have left are separate lists, as in any HR system.
  const [view, setView] = useScreenTab<'current' | 'former'>(
    'people',
    ['current', 'former'],
    'current',
  );
  const [selectedId, setSelectedId] = useSelectedEmployee();

  const departments = useMemo(
    () =>
      [
        ...new Set(directory.entries.map((entry) => entry.department).filter(Boolean)),
      ].sort() as string[],
    [directory.entries],
  );
  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return directory.entries
      .filter(
        (entry) =>
          (view === 'current') === (entry.status === 'ACTIVE') &&
          (department === ALL || entry.department === department) &&
          (!term ||
            employeeDisplayName(entry).toLowerCase().includes(term) ||
            entry.employeeNumber.toLowerCase().includes(term) ||
            (entry.workEmail ?? '').toLowerCase().includes(term) ||
            (entry.jobTitle ?? '').toLowerCase().includes(term)),
      )
      .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b)));
  }, [directory.entries, query, department, view]);
  // A directory of a few hundred is paged rather than rendered whole; the filters above still
  // search everyone, so page 1 of a search is the first match, not the first 25 names.
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [query, department, view]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const formerCount = directory.entries.filter((entry) => entry.status !== 'ACTIVE').length;

  if (selectedId)
    return (
      <PageShell>
        <EmployeeProfile employeeId={selectedId} onBack={() => window.history.back()} />
      </PageShell>
    );

  return (
    <PageShell>
      <ScreenHeader
        description="Everyone in the organization. Open a person to see and edit their details, payroll, attendance and leave."
        icon={IdCard}
        title="Employees"
        tone="primary"
      />

      <div className="flex gap-4 border-b border-border" role="tablist">
        {(
          [
            ['current', 'Current employees'],
            ['former', `Former employees${formerCount ? ` (${formerCount})` : ''}`],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-selected={view === id}
            className={`whitespace-nowrap pb-2 text-xs font-semibold ${
              view === id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            key={id}
            onClick={() => setView(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search employees"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, ID, email or job title"
            value={query}
          />
        </div>
        <div className="w-44">
          <SelectMenu onValueChange={setDepartment} value={department}>
            <SelectTrigger aria-label="Department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All departments</SelectItem>
              {departments.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectMenu>
        </div>
      </div>

      {directory.loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground" role="status">
          Loading employees…
        </p>
      ) : directory.error ? (
        <p
          className="rounded-lg border border-border bg-card p-8 text-center text-xs text-destructive"
          role="alert"
        >
          {directory.error}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card/60 p-8 text-center text-xs text-muted-foreground">
          {directory.entries.length === 0
            ? 'No employees yet. Add one from Onboarding.'
            : view === 'former'
              ? 'Nobody has left the company.'
              : 'No one matches these filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="stack-table w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-bold">Name</th>
                <th className="px-4 py-2.5 font-bold">Employee ID</th>
                <th className="px-4 py-2.5 font-bold">Department</th>
                <th className="px-4 py-2.5 font-bold">Type</th>
                <th className="px-4 py-2.5 font-bold">Joined</th>
                <th className="px-4 py-2.5 font-bold">Login</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((entry) => (
                <tr
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(entry.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td className="px-4 py-2.5" data-cell="primary">
                    <div className="flex items-center gap-2.5">
                      <PersonAvatar name={employeeDisplayName(entry)} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">
                          {employeeDisplayName(entry)}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {entry.jobTitle ?? 'No job title'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td
                    className="px-4 py-2.5 font-mono text-muted-foreground"
                    data-label="Employee ID"
                  >
                    {entry.employeeNumber}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground" data-label="Department">
                    {entry.department ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground" data-label="Type">
                    {employmentTypeLabel(entry.employmentType)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground" data-label="Joined">
                    {entry.dateOfJoining ?? '—'}
                  </td>
                  <td className="px-4 py-2.5" data-label="Login">
                    {entry.hasUserAccount ? (
                      <span className="text-emerald-700 dark:text-emerald-400">Can sign in</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">No login</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ListPager
            noun={view === 'former' ? 'former employees' : 'employees'}
            onPage={setPage}
            page={currentPage}
            pageCount={pageCount}
            total={rows.length}
          />
        </div>
      )}
    </PageShell>
  );
}

/**
 * The open profile lives in the URL (`?employee=<id>`), so Back returns to the list and a reload
 * keeps the profile open. It is deliberately not an "overlay": dialogs opened on the profile step
 * history back when they close, and an overlay-style profile closed along with them.
 */
function useSelectedEmployee(): [string | null, (id: string) => void] {
  const read = () =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('employee');
  const [selected, setSelected] = useState<string | null>(read);
  useEffect(() => {
    const onPopState = () => setSelected(read());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  // Choosing Employees in the menu rewrites the URL without a popstate; follow it.
  useEffect(() => {
    const current = read();
    if (current !== selected) setSelected(current);
  });
  const open = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('employee', id);
    window.history.pushState(window.history.state, '', url);
    setSelected(id);
  }, []);
  return [selected, open];
}
