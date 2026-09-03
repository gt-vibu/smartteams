'use client';

import React from 'react';
import { ArrowRight, Building2, Users } from 'lucide-react';
import { Button } from '@smarteam/ui';
import { employeeDisplayName, type EmployeeDirectoryEntry } from '@smarteam/contracts';
import { PersonAvatar } from '../common/person-avatar';
import type {
  DepartmentGroup,
  ReportingNode,
  useEmployeeDirectory,
} from '../../hooks/use-employee-directory';

/**
 * People, departments and the reporting line.
 *
 * All three were plain text — a table of identical rows, a bullet list, and a tree whose only
 * structure was a thin left border. Correct and unreadable: every row looked the same, so finding
 * a person meant reading all of them.
 *
 * They are cards now, each person carrying the initials chip they carry everywhere else, so the
 * eye can follow one individual between the directory, their department and the reporting line.
 * The data behind them is unchanged and still comes from one directory request.
 */

type Directory = ReturnType<typeof useEmployeeDirectory>;

/** How many rows a summary shows before handing off to the module that owns the full list. */
const PREVIEW_LIMIT = 6;

export function OrgPeoplePanel({
  directory,
  onNavigateModule,
  view,
}: {
  directory: Directory;
  onNavigateModule?: (module: string) => void;
  view: 'directory' | 'departments' | 'reporting';
}) {
  if (directory.forbidden)
    return (
      <Notice
        detail="You do not have permission to view the people in this organization."
        title="Not available"
      />
    );

  if (directory.loading)
    return (
      <p className="py-10 text-center text-xs text-muted-foreground" role="status">
        Loading people...
      </p>
    );

  if (directory.error)
    return <Notice detail={directory.error} role="alert" title="Could not load people" />;

  if (directory.entries.length === 0)
    return <Notice detail="No employees have been added yet." title="Nobody here yet" />;

  return (
    <div className="space-y-3">
      {directory.truncated && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          Showing the first {directory.entries.length} people. This organization has more than these
          views load at once.
        </p>
      )}
      {view === 'directory' && (
        <DirectoryTable directory={directory} onNavigateModule={onNavigateModule} />
      )}
      {view === 'departments' && <Departments groups={directory.departments} />}
      {view === 'reporting' && <Reporting roots={directory.reportingTree} />}
    </div>
  );
}

function DirectoryTable({
  directory,
  onNavigateModule,
}: {
  directory: Directory;
  onNavigateModule?: (module: string) => void;
}) {
  // A summary, not the directory. Onboarding owns the full roster and the actions on it.
  const rows = directory.entries.slice(0, PREVIEW_LIMIT);
  const remaining = directory.entries.length - rows.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-bold">Name</th>
              <th className="px-4 py-2.5 font-bold">Number</th>
              <th className="px-4 py-2.5 font-bold">Department</th>
              <th className="px-4 py-2.5 font-bold">Joined</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr
                className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                key={entry.id}
              >
                {/* Name and job title in one cell: they are one fact about a person, and splitting
                  them across columns left the title column half empty for anyone without one. */}
                <td className="px-4 py-2.5">
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
                <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                  {entry.employeeNumber}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{entry.department ?? '--'}</td>
                <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                  {entry.dateOfJoining ?? '--'}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={entry.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground">
          {remaining > 0
            ? `Showing ${rows.length} of ${directory.entries.length}`
            : `${directory.entries.length} ${directory.entries.length === 1 ? 'person' : 'people'}`}
        </span>
        <Button
          className="h-auto gap-1 px-2 py-1 text-[11px]"
          onClick={() => onNavigateModule?.('onboarding')}
          size="sm"
          type="button"
          variant="ghost"
        >
          Manage people
          <ArrowRight aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}

function Departments({ groups }: { groups: DepartmentGroup[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Grouped from the department recorded on each employment record. There is no department
        entity, so one exists exactly as long as someone is in it.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.slice(0, PREVIEW_LIMIT).map((group) => (
          <section
            className="flex flex-col rounded-xl border border-border bg-card p-4"
            key={group.name}
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
              >
                <Building2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-xs font-bold text-foreground">{group.name}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {group.members.length} {group.members.length === 1 ? 'person' : 'people'}
                </p>
              </div>
            </div>

            <ul className="mt-3 space-y-2 border-t border-border pt-3">
              {group.members.slice(0, 6).map((member) => (
                <li className="flex items-center gap-2" key={member.id}>
                  <PersonAvatar name={employeeDisplayName(member)} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-foreground">
                      {employeeDisplayName(member)}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {member.jobTitle ?? 'No job title'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {group.members.length > 6 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                and {group.members.length - 6} more
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function Reporting({ roots }: { roots: ReportingNode[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Derived from each employee&apos;s manager. Anyone whose manager is not recorded appears at
        the top level rather than being left out.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
        <ul className="min-w-[380px] space-y-2">
          {roots.slice(0, PREVIEW_LIMIT).map((node) => (
            <TreeNode depth={0} key={node.employee.id} node={node} />
          ))}
        </ul>
        {roots.length > PREVIEW_LIMIT && (
          <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
            Showing {PREVIEW_LIMIT} of {roots.length} reporting lines.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One person and everyone under them.
 *
 * The nesting is drawn with a rail down the left of each child list plus a short elbow into each
 * card, rather than by indentation alone — with six people at one level, indentation on its own
 * gave no sense of what was joined to what.
 */
function TreeNode({ depth, node }: { depth: number; node: ReportingNode }) {
  return (
    <li className="relative">
      {/* The elbow joining this card to its parent's rail. There is no rail at the top level, so
          nothing to join to — hence the depth check rather than a CSS descendant selector, which
          would match every node since they are all `<li>`. */}
      {depth > 0 && (
        <span aria-hidden="true" className="absolute -left-5 top-6 h-px w-5 bg-border" />
      )}
      <PersonCard employee={node.employee} reportCount={node.reports.length} />
      {node.reports.length > 0 && (
        <ul className="ml-5 mt-2 space-y-2 border-l border-border pl-5">
          {node.reports.map((child) => (
            <TreeNode depth={depth + 1} key={child.employee.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PersonCard({
  employee,
  reportCount,
}: {
  employee: EmployeeDirectoryEntry;
  reportCount: number;
}) {
  const name = employeeDisplayName(employee);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <PersonAvatar name={name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-foreground">{name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {employee.jobTitle ?? 'No job title'}
          {employee.department ? ` · ${employee.department}` : ''}
        </div>
      </div>
      {reportCount > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          <Users aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
          {reportCount}
        </span>
      )}
    </div>
  );
}

/**
 * Status as a shape as well as a word, so "terminated" is visible in a long list without being
 * read. Semantic colour, kept away from the accent used for category marks.
 */
function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : status === 'TERMINATED'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${tone}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function Notice({
  detail,
  role = 'status',
  title,
}: {
  detail: string;
  role?: 'status' | 'alert';
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center" role={role}>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
