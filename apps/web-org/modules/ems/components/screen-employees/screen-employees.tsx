'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  LoadingIndicator,
  Button,
  Input,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import {
  employeeDisplayName,
  type EmployeeDirectoryEntry,
  employmentTypeLabel,
  formatDate,
  hasPermission,
} from '@smarteam/contracts';
import {
  BookmarkPlus,
  IdCard,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
  Plus,
  Users,
  Building2,
  UserRoundX,
  UserRoundCheck,
} from 'lucide-react';
import { useSession } from '../../hooks/auth-context';
import { ResignationsPanel } from './resignations-panel';
import { ProbationPanel } from './probation-panel';
import { CustomFieldsPanel } from './custom-fields-panel';
import { ScreenHeader } from '../common/screen-header';
import { PageShell } from '../layout/page-shell';
import { PersonAvatar } from '../common/person-avatar';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import { EmployeeProfile } from './employee-profile';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { CursorPageControls } from '../common/cursor-page-controls';
import { EmployeeCombobox } from '../common/employee-combobox';
import { BulkWorkforcePanel } from '../common/bulk-workforce-panel';

const ALL = '__all__';
const SAVED_VIEW_LIMIT = 12;
type DirectoryStatus = 'current' | 'former';
type ManagerFilter = 'any' | 'unassigned' | 'manager';
type EmployeeSavedView = {
  id: string;
  name: string;
  status: DirectoryStatus;
  query: string;
  department: string;
  joinedFrom: string;
  order: 'name' | 'recent';
  managerFilter: ManagerFilter;
  managerEmployeeId: string;
};

function savedViewStorageKey(organizationId: string) {
  return `smarteam:employee-directory-views:${organizationId}`;
}

function readSavedViews(organizationId: string): EmployeeSavedView[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(savedViewStorageKey(organizationId)) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEmployeeSavedView).slice(0, SAVED_VIEW_LIMIT);
  } catch {
    return [];
  }
}

function isEmployeeSavedView(value: unknown): value is EmployeeSavedView {
  if (!value || typeof value !== 'object') return false;
  const view = value as Record<string, unknown>;
  return (
    typeof view.id === 'string' &&
    typeof view.name === 'string' &&
    (view.status === 'current' || view.status === 'former') &&
    typeof view.query === 'string' &&
    typeof view.department === 'string' &&
    typeof view.joinedFrom === 'string' &&
    (view.order === 'name' || view.order === 'recent') &&
    (view.managerFilter === 'any' ||
      view.managerFilter === 'unassigned' ||
      view.managerFilter === 'manager') &&
    typeof view.managerEmployeeId === 'string'
  );
}

/**
 * The employee directory: everyone in the organization, searchable and filterable. Choosing a
 * person opens their profile, where their details, payroll, attendance, leave, projects and
 * teams are viewed and edited in one place.
 */
export function ScreenEmployees({
  onNavigateModule,
}: {
  onNavigateModule?: (module: string, view?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState(ALL);
  const [joinedFrom, setJoinedFrom] = useState('');
  const [order, setOrder] = useState<'name' | 'recent'>('name');
  const [managerFilter, setManagerFilter] = useState<ManagerFilter>('any');
  const [managerEmployeeId, setManagerEmployeeId] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<EmployeeSavedView[]>([]);
  const [savedViewName, setSavedViewName] = useState('');
  const [savingView, setSavingView] = useState(false);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  // Current staff and those who have left are separate lists, as in any HR system.
  const [view, setView] = useScreenTab<
    'current' | 'managers' | 'unassigned' | 'no-login' | 'former' | 'exits' | 'probation' | 'fields'
  >(
    'people',
    ['current', 'managers', 'unassigned', 'no-login', 'former', 'exits', 'probation', 'fields'],
    'current',
  );
  const selectedManager =
    managerFilter === 'unassigned'
      ? 'ROOT'
      : managerFilter === 'manager'
        ? managerEmployeeId
        : undefined;
  const directory = useEmployeeDirectory(
    {
      search: query,
      status: view === 'former' ? 'INACTIVE' : 'ACTIVE',
      hasDirectReports: view === 'managers' ? true : undefined,
      hasLogin: view === 'no-login' ? false : undefined,
      department: department === ALL ? undefined : department,
      joinedFrom: joinedFrom || undefined,
      order,
      reportingManager: view === 'unassigned' ? 'ROOT' : selectedManager || undefined,
    },
    (view === 'current' ||
      view === 'managers' ||
      view === 'unassigned' ||
      view === 'no-login' ||
      view === 'former') &&
      (managerFilter !== 'manager' || Boolean(managerEmployeeId)),
  );
  const [exportError, setExportError] = useState('');
  const [selectedId, setSelectedId] = useSelectedEmployee();
  const { persona, session: employeeSession } = useSession();
  const canImport = hasPermission(persona?.permissions ?? [], 'employees.write');

  useEffect(() => {
    if (employeeSession?.organizationId)
      setSavedViews(readSavedViews(employeeSession.organizationId));
  }, [employeeSession?.organizationId]);

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [filtersOpen]);

  const departments = directory.summary?.departments.map((entry) => entry.name) ?? [];
  const rows = directory.entries;
  const formerCount = directory.summary?.former ?? 0;
  const activeCount = directory.summary?.active ?? 0;
  const organizationHasNoEmployees =
    directory.summary !== null && activeCount === 0 && formerCount === 0;
  const activeFilterCount = [
    query.trim().length > 0,
    department !== ALL,
    joinedFrom.length > 0,
    order !== 'name',
    managerFilter !== 'any',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setQuery('');
    setDepartment(ALL);
    setJoinedFrom('');
    setOrder('name');
    setManagerFilter('any');
    setManagerEmployeeId('');
    setActiveSavedViewId(null);
  };

  const applySavedView = (saved: EmployeeSavedView) => {
    setQuery(saved.query);
    setDepartment(saved.department);
    setJoinedFrom(saved.joinedFrom);
    setOrder(saved.order);
    setManagerFilter(saved.managerFilter);
    setManagerEmployeeId(saved.managerEmployeeId);
    setView(saved.status);
    setActiveSavedViewId(saved.id);
  };

  const persistSavedViews = (next: EmployeeSavedView[]) => {
    setSavedViews(next);
    if (employeeSession?.organizationId) {
      try {
        localStorage.setItem(
          savedViewStorageKey(employeeSession.organizationId),
          JSON.stringify(next),
        );
      } catch {
        setExportError(
          'This browser could not save the view. Check its storage settings and try again.',
        );
      }
    }
  };

  const saveCurrentView = () => {
    const name = savedViewName.trim();
    if (!name || savedViews.length >= SAVED_VIEW_LIMIT) return;
    const saved: EmployeeSavedView = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`,
      name,
      status: view === 'former' ? 'former' : 'current',
      query: query.trim(),
      department,
      joinedFrom,
      order,
      managerFilter,
      managerEmployeeId,
    };
    persistSavedViews([...savedViews, saved]);
    setSavedViewName('');
    setSavingView(false);
    setActiveSavedViewId(saved.id);
  };

  if (selectedId)
    return (
      <PageShell>
        <EmployeeProfile employeeId={selectedId} onBack={() => window.history.back()} />
      </PageShell>
    );

  return (
    <PageShell>
      <ScreenHeader
        actions={
          canImport && (
            <Button onClick={() => onNavigateModule?.('onboarding')} type="button">
              <Plus className="mr-1.5 size-4" /> Add employee
            </Button>
          )
        }
        icon={IdCard}
        title="Employees"
        tone="primary"
      />
      {exportError && (
        <p role="alert" className="text-xs text-destructive">
          {exportError}
        </p>
      )}
      <BulkWorkforcePanel />

      <div className="sticky top-[var(--ems-context-bar-height)] z-20 space-y-3 border-b border-border bg-background/95 pb-3 pt-1 backdrop-blur-sm">
        <div
          className="flex gap-4 overflow-x-auto border-b border-border"
          role="tablist"
          aria-label="Employee lists"
        >
          {(
            [
              ['current', 'Current employees'],
              ['managers', 'Managers'],
              [
                'unassigned',
                `No manager${directory.summary?.withoutManager ? ` (${directory.summary.withoutManager})` : ''}`,
              ],
              [
                'no-login',
                `No login${directory.summary?.withoutLogin ? ` (${directory.summary.withoutLogin})` : ''}`,
              ],
              ['former', `Former employees${formerCount ? ` (${formerCount})` : ''}`],
              ...(canImport
                ? ([
                    ['probation', 'Probation'],
                    ['exits', 'Exit details'],
                    ['fields', 'Custom fields'],
                  ] as const)
                : []),
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
              onClick={() => {
                setView(id);
                setActiveSavedViewId(null);
              }}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {(view === 'current' ||
          view === 'managers' ||
          view === 'unassigned' ||
          view === 'no-login' ||
          view === 'former') && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search employees"
                  className="pl-8"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveSavedViewId(null);
                  }}
                  placeholder="Search name, employee ID or email"
                  maxLength={100}
                  value={query}
                />
              </div>
              <Button
                aria-expanded={filtersOpen}
                className="gap-1.5"
                onClick={() => {
                  setSavingView(false);
                  setFiltersOpen((open) => !open);
                }}
                size="sm"
                type="button"
                variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'outline'}
              >
                <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
              </Button>
              <Button
                className="gap-1.5"
                disabled={savedViews.length >= SAVED_VIEW_LIMIT}
                onClick={() => {
                  setFiltersOpen(false);
                  setSavingView((saving) => !saving);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <BookmarkPlus aria-hidden="true" className="size-3.5" />
                Save view
              </Button>
              {activeFilterCount > 0 && (
                <Button
                  className="gap-1.5"
                  onClick={resetFilters}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-3.5" /> Clear
                </Button>
              )}
            </div>

            {savingView && (
              <form
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveCurrentView();
                }}
              >
                <Input
                  aria-label="Saved view name"
                  autoFocus
                  className="min-w-[180px] flex-1"
                  maxLength={40}
                  onChange={(event) => setSavedViewName(event.target.value)}
                  placeholder="e.g. Engineering joined this year"
                  value={savedViewName}
                />
                <Button disabled={!savedViewName.trim()} size="sm" type="submit">
                  Save view
                </Button>
                <Button
                  onClick={() => setSavingView(false)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </form>
            )}

            {savedViews.length > 0 && (
              <div
                className="flex min-w-0 items-center gap-2 overflow-x-auto"
                aria-label="Saved employee views"
              >
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                  Saved
                </span>
                {savedViews.map((saved) => (
                  <span
                    className="inline-flex shrink-0 items-center rounded-full border border-border"
                    key={saved.id}
                  >
                    <button
                      aria-pressed={activeSavedViewId === saved.id}
                      className={`max-w-56 truncate rounded-l-full px-3 py-1.5 text-xs ${activeSavedViewId === saved.id ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-muted'}`}
                      onClick={() => applySavedView(saved)}
                      type="button"
                    >
                      {saved.name}
                    </button>
                    <button
                      aria-label={`Delete saved view ${saved.name}`}
                      className="grid size-7 place-items-center rounded-r-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        persistSavedViews(savedViews.filter((entry) => entry.id !== saved.id));
                        if (activeSavedViewId === saved.id) setActiveSavedViewId(null);
                      }}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {filtersOpen && (
              <>
                <button
                  aria-label="Close employee filters"
                  className="fixed inset-0 z-40 cursor-default bg-slate-950/25 sm:hidden"
                  onClick={() => setFiltersOpen(false)}
                  tabIndex={-1}
                  type="button"
                />
                <section
                  aria-label="Employee filters"
                  className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex max-h-[min(64dvh,34rem)] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:static sm:grid sm:max-h-none sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:rounded-lg sm:p-3 sm:shadow-none xl:grid-cols-4"
                >
                  <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:hidden">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Filters</h3>
                      <p className="text-xs text-muted-foreground">Results update as you choose</p>
                    </div>
                    <Button
                      aria-label="Done with filters"
                      onClick={() => setFiltersOpen(false)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Done
                    </Button>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain p-4 sm:contents sm:overflow-visible sm:p-0">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Department
                      </label>
                      <SelectMenu
                        onValueChange={(value) => {
                          setDepartment(value);
                          setActiveSavedViewId(null);
                        }}
                        value={department}
                      >
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
                    <div className="space-y-1.5">
                      <label
                        className="text-[11px] font-medium text-muted-foreground"
                        htmlFor="employee-joined-from"
                      >
                        Joined on or after
                      </label>
                      <Input
                        id="employee-joined-from"
                        onChange={(event) => {
                          setJoinedFrom(event.target.value);
                          setActiveSavedViewId(null);
                        }}
                        type="date"
                        value={joinedFrom}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Sort by
                      </label>
                      <SelectMenu
                        onValueChange={(value) => {
                          setOrder(value as 'name' | 'recent');
                          setActiveSavedViewId(null);
                        }}
                        value={order}
                      >
                        <SelectTrigger aria-label="Sort employees">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Name, A to Z</SelectItem>
                          <SelectItem value="recent">Recently joined</SelectItem>
                        </SelectContent>
                      </SelectMenu>
                    </div>
                    {view !== 'unassigned' && view !== 'no-login' && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          Reporting manager
                        </label>
                        <SelectMenu
                          onValueChange={(value) => {
                            setManagerFilter(value as ManagerFilter);
                            if (value !== 'manager') setManagerEmployeeId('');
                            setActiveSavedViewId(null);
                          }}
                          value={managerFilter}
                        >
                          <SelectTrigger aria-label="Manager filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any manager</SelectItem>
                            <SelectItem value="unassigned">No manager assigned</SelectItem>
                            <SelectItem value="manager">Specific manager</SelectItem>
                          </SelectContent>
                        </SelectMenu>
                        {managerFilter === 'manager' && (
                          <EmployeeCombobox
                            employees={[] as EmployeeDirectoryEntry[]}
                            value={managerEmployeeId}
                            onChange={(employeeId) => {
                              setManagerEmployeeId(employeeId);
                              setActiveSavedViewId(null);
                            }}
                            placeholder="Choose manager"
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-3 sm:hidden">
                    <span className="text-xs text-muted-foreground">
                      {activeFilterCount ? `${activeFilterCount} active` : 'No filters selected'}
                    </span>
                    <Button onClick={resetFilters} size="sm" type="button" variant="outline">
                      Clear all
                    </Button>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>

      {(view === 'current' ||
        view === 'managers' ||
        view === 'unassigned' ||
        view === 'no-login' ||
        view === 'former') && (
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          aria-label="Employee directory summary"
        >
          {[
            {
              label: 'Active employees',
              value: directory.summary?.active,
              icon: Users,
              selected: view === 'current',
              onClick: () => {
                resetFilters();
                setView('current');
              },
            },
            {
              label: 'Managers',
              value: directory.summary?.managers,
              icon: UserRoundCheck,
              selected: view === 'managers',
              onClick: () => {
                resetFilters();
                setView('managers');
              },
            },
            {
              label: 'Former employees',
              value: directory.summary?.former,
              icon: UserRoundX,
              selected: view === 'former',
              onClick: () => {
                resetFilters();
                setView('former');
              },
            },
            {
              label: 'Departments',
              value: directory.summary?.departments.length,
              icon: Building2,
              selected: false,
              onClick: () => onNavigateModule?.('org-setup', 'departments'),
            },
          ].map(({ label, value, icon: Icon, selected, onClick }) => (
            <button
              aria-pressed={selected}
              className={`flex min-h-20 items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? 'border-primary/50 ring-1 ring-primary/25' : 'border-border'}`}
              key={label}
              onClick={onClick}
              type="button"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <b className="block tabular-nums text-lg leading-tight">
                  {directory.summaryLoading && value === undefined
                    ? '—'
                    : (value ?? 0).toLocaleString()}
                </b>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                  {label}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {directory.refreshing && (
        <p className="text-[11px] text-muted-foreground" role="status">
          Updating employees…
        </p>
      )}

      {view === 'exits' ? (
        <ResignationsPanel />
      ) : view === 'probation' ? (
        <ProbationPanel />
      ) : view === 'fields' ? (
        <CustomFieldsPanel />
      ) : (
        <>
          {managerFilter === 'manager' && !managerEmployeeId ? (
            <p className="rounded-lg border border-dashed border-border bg-card/60 p-8 text-center text-xs text-muted-foreground">
              Choose a reporting manager to see their direct reports.
            </p>
          ) : directory.loading ? (
            <LoadingIndicator
              variant="panel"
              label="Loading employees"
              className="py-8 text-center text-xs text-muted-foreground"
            />
          ) : directory.error ? (
            <p
              className="rounded-lg border border-border bg-card p-8 text-center text-xs text-destructive"
              role="alert"
            >
              {directory.error}
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {organizationHasNoEmployees
                  ? 'No employees yet'
                  : view === 'former'
                    ? 'No former employees'
                    : view === 'managers'
                      ? 'No managers with active direct reports'
                      : view === 'unassigned'
                        ? 'Everyone has a reporting manager'
                        : view === 'no-login'
                          ? 'Everyone has account access'
                          : activeCount === 0
                            ? 'No active employees'
                            : 'No matching employees'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {organizationHasNoEmployees
                  ? 'Add the first employee to start your directory.'
                  : 'Try changing or clearing your filters.'}
              </p>
              {organizationHasNoEmployees && canImport && (
                <Button className="mt-4" onClick={() => onNavigateModule?.('onboarding')}>
                  <Plus className="mr-1.5 size-4" /> Add employee
                </Button>
              )}
            </div>
          ) : (
            <div className="min-w-0 rounded-lg border border-border bg-card">
              <div className="overflow-x-auto">
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
                    {rows.map((entry) => (
                      <tr
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
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
                              {entry.jobTitle && (
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {entry.jobTitle}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-4 py-2.5 tabular-nums text-muted-foreground"
                          data-bare=""
                          data-label="Employee ID"
                        >
                          {entry.employeeNumber}
                        </td>
                        <td
                          className="px-4 py-2.5 text-muted-foreground"
                          data-bare=""
                          data-label="Department"
                        >
                          {entry.department ?? '—'}
                        </td>
                        <td
                          className="px-4 py-2.5 text-muted-foreground"
                          data-bare=""
                          data-label="Type"
                        >
                          {employmentTypeLabel(entry.employmentType)}
                        </td>
                        <td
                          className="px-4 py-2.5 tabular-nums text-muted-foreground"
                          data-label="Joined"
                        >
                          {formatDate(entry.dateOfJoining) || '—'}
                        </td>
                        <td className="px-4 py-2.5" data-bare="" data-label="Login">
                          {entry.hasUserAccount ? (
                            <span className="text-emerald-700 dark:text-emerald-400">
                              Can sign in
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">No login</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <CursorPageControls
                page={directory.paging.page}
                count={rows.length}
                nextCursor={directory.nextCursor}
                busy={directory.refreshing}
                previous={directory.paging.previous}
                next={directory.paging.next}
              />
            </div>
          )}
        </>
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
