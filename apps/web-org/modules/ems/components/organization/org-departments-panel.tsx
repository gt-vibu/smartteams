'use client';

import type { Department } from '@smarteam/contracts';
import { LoadingIndicator, Button, Dialog, DialogContent, DialogTitle, Input } from '@smarteam/ui';
import { Building2, Plus, Search, UserRoundX, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../common/empty-state';
import { SummaryMetricCard } from '../common/summary-metric-card';
import { useDepartments } from '../../hooks/use-departments';
import { DepartmentDialog } from './department-dialog';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

/**
 * The organization's departments: who heads each, who is in it, and the employee-number series
 * new joiners get. Departments used to be whatever text was typed on each employee.
 */
export function OrgDepartmentsPanel() {
  const departments = useDepartments();
  const [editing, setEditing] = useState<Department | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [needsHeadOnly, setNeedsHeadOnly] = useState(false);
  const settledSearch = useDebouncedValue(search.trim());
  const [removingMember, setRemovingMember] = useState<{
    departmentId: string;
    departmentName: string;
    memberId: string;
    memberName: string;
  } | null>(null);

  const openDialog = (department: Department | null) => {
    setEditing(department);
    setOpen(true);
  };

  const confirmRemove = async () => {
    if (!removingMember) return;
    await departments.removeMember(removingMember.departmentId, removingMember.memberId);
    setRemovingMember(null);
  };
  const visibleDepartments = departments.departments.filter(
    (department) =>
      (!needsHeadOnly || !department.head) &&
      department.name.toLocaleLowerCase().includes(settledSearch.toLocaleLowerCase()),
  );
  const assignedPeople = departments.departments.reduce(
    (total, department) => total + (department.memberCount ?? department.members.length),
    0,
  );
  const departmentsWithoutHead = departments.departments.filter(
    (department) => !department.head,
  ).length;

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetricCard
          active={!needsHeadOnly}
          detail="Organization units"
          icon={Building2}
          label="Departments"
          onClick={() => setNeedsHeadOnly(false)}
          value={departments.departments.length}
          tone="primary"
        />
        <SummaryMetricCard
          detail="Across listed departments"
          icon={UsersRound}
          label="Employee assignments"
          value={assignedPeople}
        />
        <SummaryMetricCard
          active={needsHeadOnly}
          detail={departmentsWithoutHead ? 'Review department ownership' : 'Every department has a head'}
          icon={UserRoundX}
          label="Departments without a head"
          onClick={() => setNeedsHeadOnly((value) => !value)}
          value={departmentsWithoutHead}
          tone={departmentsWithoutHead ? 'warning' : 'success'}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search departments"
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search departments"
            value={search}
          />
        </div>
        {departments.canWrite && (
          <Button className="gap-1.5" onClick={() => openDialog(null)} size="sm" type="button">
            <Plus className="h-3.5 w-3.5" />
            New department
          </Button>
        )}
      </div>

      {departments.loading && (
        <LoadingIndicator
          variant="panel"
          label="Loading departments"
          className="py-6 text-center text-xs text-muted-foreground"
        />
      )}
      {departments.error && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          role="alert"
        >
          {departments.error}
        </p>
      )}
      {!departments.loading && departments.departments.length === 0 && (
        <EmptyState
          detail="Create departments to organize employees and set their employee-number series."
          icon={Building2}
          title="Set up your first department"
          action={departments.canWrite ? (
            <Button onClick={() => openDialog(null)} size="sm" type="button">
              <Plus aria-hidden="true" className="mr-1.5 size-4" />
              New department
            </Button>
          ) : undefined}
        />
      )}

      {!departments.loading &&
        departments.departments.length > 0 &&
        visibleDepartments.length === 0 && (
          <EmptyState
            detail="Try a different name or clear the head filter."
            icon={Search}
            title="No matching departments"
          />
        )}

      <div className={`grid gap-3 ${visibleDepartments.length === 1 ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
        {visibleDepartments.map((department) => (
          <article className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm" key={department.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-foreground">{department.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {department.employeeNumberPrefix
                      ? `${department.employeeNumberPrefix} series · next ${department.nextEmployeeNumber}`
                      : 'No employee-number series'}
                  </p>
                </div>
              </div>
              {departments.canWrite && (
                <Button
                  onClick={() => openDialog(department)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Edit
                </Button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Department head</p>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {department.head?.name ?? 'Not assigned'}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Employees</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {(department.memberCount ?? department.members.length).toLocaleString()}
                </p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-border/60 text-sm">
              {department.members.map((member) => (
                <li className="flex items-center justify-between gap-2 py-1.5" key={member.id}>
                  <span className="min-w-0 truncate">
                    <span className="text-foreground">{member.name}</span>{' '}
                    <span className="text-muted-foreground">{member.employeeNumber}</span>
                  </span>
                  {departments.canWrite && (
                    <Button
                      className="h-7 px-2 text-[11px] text-destructive"
                      disabled={departments.saving}
                      onClick={() =>
                        setRemovingMember({
                          departmentId: department.id,
                          departmentName: department.name,
                          memberId: member.id,
                          memberName: member.name,
                        })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
              {department.members.length === 0 && (
                <li className="py-1.5 text-muted-foreground">No one in this department yet.</li>
              )}
            </ul>
            {(department.memberCount ?? department.members.length) > department.members.length && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Showing 5 of{' '}
                {(department.memberCount ?? department.members.length).toLocaleString()} employees.
                Edit the department to manage assignments.
              </p>
            )}
          </article>
        ))}
      </div>

      <DepartmentDialog
        department={editing}
        departments={departments}
        employees={[]}
        onOpenChange={setOpen}
        open={open}
      />

      <Dialog
        onOpenChange={(openNext) => !openNext && setRemovingMember(null)}
        open={removingMember !== null}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle>Remove from department</DialogTitle>
          <p className="mt-2 text-xs text-muted-foreground">
            Are you sure you want to remove{' '}
            <strong className="text-foreground">{removingMember?.memberName}</strong> from{' '}
            <strong className="text-foreground">{removingMember?.departmentName}</strong>?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => setRemovingMember(null)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={departments.saving}
              onClick={() => void confirmRemove()}
              size="sm"
              type="button"
              variant="destructive"
            >
              {departments.saving ? 'Removing…' : 'Remove member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
