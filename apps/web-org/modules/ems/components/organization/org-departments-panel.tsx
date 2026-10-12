'use client';

import type { Department } from '@smarteam/contracts';
import { LoadingIndicator, Button, Dialog, DialogContent, DialogTitle, Input } from '@smarteam/ui';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          aria-pressed={!needsHeadOnly}
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setNeedsHeadOnly(false)}
          type="button"
        >
          <span className="text-[11px] text-muted-foreground">Departments</span>
          <span className="mt-0.5 block text-xl font-semibold tabular-nums">
            {departments.departments.length}
          </span>
          <span className="text-[10px] text-muted-foreground">Organization units</span>
        </button>
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <span className="text-[11px] text-muted-foreground">Employee assignments</span>
          <span className="mt-0.5 block text-xl font-semibold tabular-nums">
            {assignedPeople.toLocaleString()}
          </span>
          <span className="text-[10px] text-muted-foreground">Across listed departments</span>
        </div>
        <button
          aria-pressed={needsHeadOnly}
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setNeedsHeadOnly((value) => !value)}
          type="button"
        >
          <span className="text-[11px] text-muted-foreground">Departments without a head</span>
          <span className="mt-0.5 block text-xl font-semibold tabular-nums">
            {departmentsWithoutHead}
          </span>
          <span className="text-[10px] text-muted-foreground">Click to review ownership</span>
        </button>
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
        <p className="rounded-lg border border-dashed border-border bg-card/60 p-8 text-center text-xs text-muted-foreground">
          No departments yet. Create one to group people and give new joiners numbered IDs.
        </p>
      )}

      {!departments.loading &&
        departments.departments.length > 0 &&
        visibleDepartments.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-card/60 p-8 text-center text-xs text-muted-foreground">
            No departments match these filters.
          </p>
        )}

      <div className="grid gap-3 md:grid-cols-2">
        {visibleDepartments.map((department) => (
          <article className="rounded-lg border border-border bg-card p-4" key={department.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-foreground">{department.name}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {department.employeeNumberPrefix
                    ? `Series ${department.employeeNumberPrefix} · next ${department.nextEmployeeNumber}`
                    : 'No number series'}
                </p>
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
            <p className="mt-3 text-xs">
              <span className="text-muted-foreground">Head: </span>
              <span className="font-semibold text-foreground">
                {department.head?.name ?? 'Not set'}
              </span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {(department.memberCount ?? department.members.length).toLocaleString()} employees
            </p>
            <ul className="mt-2 divide-y divide-border/60 text-xs">
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
