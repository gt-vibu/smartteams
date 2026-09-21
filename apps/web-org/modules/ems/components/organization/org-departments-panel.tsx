'use client';

import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import type { Department } from '@smarteam/contracts';
import { Plus } from 'lucide-react';
import { useDepartments } from '../../hooks/use-departments';
import { useEmployees } from '../../hooks/use-workforce';
import { DepartmentDialog } from './department-dialog';

/**
 * The organization's departments: who heads each, who is in it, and the employee-number series
 * new joiners get. Departments used to be whatever text was typed on each employee.
 */
export function OrgDepartmentsPanel() {
  const departments = useDepartments();
  const employees = useEmployees();
  const [editing, setEditing] = useState<Department | null>(null);
  const [open, setOpen] = useState(false);

  const openDialog = (department: Department | null) => {
    setEditing(department);
    setOpen(true);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {departments.departments.length} department
          {departments.departments.length === 1 ? '' : 's'}
        </p>
        {departments.canWrite && (
          <Button className="gap-1.5" onClick={() => openDialog(null)} size="sm" type="button">
            <Plus className="h-3.5 w-3.5" />
            New department
          </Button>
        )}
      </div>

      {departments.loading && (
        <p className="py-6 text-center text-xs text-muted-foreground" role="status">
          Loading departments…
        </p>
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

      <div className="grid gap-3 md:grid-cols-2">
        {departments.departments.map((department) => (
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
            <ul className="mt-2 divide-y divide-border/60 text-xs">
              {department.members.map((member) => (
                <li className="flex items-center justify-between gap-2 py-1.5" key={member.id}>
                  <span className="min-w-0 truncate">
                    <span className="text-foreground">{member.name}</span>{' '}
                    <span className="text-muted-foreground">{member.employeeNumber}</span>
                  </span>
                  {departments.canWrite && (
                    <Button
                      className="h-7 px-2 text-[11px]"
                      disabled={departments.saving}
                      onClick={() => void departments.removeMember(department.id, member.id)}
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
          </article>
        ))}
      </div>

      <DepartmentDialog
        department={editing}
        departments={departments}
        employees={employees.data ?? []}
        onOpenChange={setOpen}
        open={open}
      />
    </section>
  );
}
