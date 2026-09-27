'use client';

import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { employeeDisplayName, type Department, type Employee } from '@smarteam/contracts';
import type { DepartmentsState } from '../../hooks/use-departments';
import { activeByName } from '../../lib/pickable';

const NO_HEAD = '__none__';

/**
 * Create or edit a department: its name, its employee-number series, its head and its members.
 * The Departments tab and onboarding's quick add both use this, so a department made either way
 * is the same.
 */
export function DepartmentDialog({
  open,
  onOpenChange,
  department,
  departments,
  employees,
  onSaved,
  showMembers = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The department to edit; null to create one. */
  department: Department | null;
  departments: DepartmentsState;
  employees: Employee[];
  onSaved?: (departmentId: string) => void;
  /** Onboarding's quick add leaves members out: the person being added joins it anyway. */
  showMembers?: boolean;
}) {
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [headId, setHeadId] = useState(NO_HEAD);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(department?.name ?? '');
    setPrefix(department?.employeeNumberPrefix ?? '');
    setHeadId(department?.head?.id ?? NO_HEAD);
    setMemberIds(department?.members.map((member) => member.id) ?? []);
    setSearch('');
    departments.clearError();
    // Reset only when the dialog opens or targets another department.
  }, [open, department?.id]);

  const cleanPrefix = prefix.trim().toUpperCase();
  const prefixValid = cleanPrefix === '' || /^[A-Z0-9]{1,6}$/.test(cleanPrefix);
  const query = search.trim().toLowerCase();
  const listed = employees.filter(
    (employee) =>
      !query ||
      employeeDisplayName(employee).toLowerCase().includes(query) ||
      employee.employeeNumber.toLowerCase().includes(query),
  );

  const toggle = (id: string) =>
    setMemberIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const submit = async () => {
    if (!name.trim() || !prefixValid) return;
    const id = await departments.save(department?.id ?? null, {
      name: name.trim(),
      employeeNumberPrefix: cleanPrefix || null,
      headEmployeeId: headId === NO_HEAD ? null : headId,
      ...(showMembers ? { employeeIds: memberIds } : {}),
    });
    if (id) {
      onSaved?.(id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{department ? `Edit ${department.name}` : 'New department'}</DialogTitle>
        <div className="mt-4 space-y-4">
          <div>
            <Label className="mb-1 block" htmlFor="department-name">
              Name
            </Label>
            <Input
              id="department-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Testing"
              value={name}
            />
          </div>
          <div>
            <Label className="mb-1 block" htmlFor="department-prefix">
              Employee number series (optional)
            </Label>
            <Input
              aria-invalid={!prefixValid || undefined}
              className="uppercase sm:max-w-[10rem]"
              id="department-prefix"
              maxLength={6}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="e.g. TE"
              value={prefix}
            />
            <p
              className={`mt-1 text-[11px] ${prefixValid ? 'text-muted-foreground' : 'text-destructive'}`}
            >
              {prefixValid
                ? cleanPrefix
                  ? `People hired into this department get ${cleanPrefix}1, ${cleanPrefix}2 and so on.`
                  : 'Leave empty to type employee numbers by hand.'
                : 'Use 1 to 6 letters or digits, such as TE.'}
            </p>
          </div>
          <div>
            <Label className="mb-1 block">Department head</Label>
            <SelectMenu onValueChange={setHeadId} value={headId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_HEAD}>No head yet</SelectItem>
                {activeByName(employees).map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employeeDisplayName(employee)} · {employee.employeeNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectMenu>
          </div>

          {showMembers && (
            <div>
              <Label className="mb-1 block" htmlFor="department-search">
                Employees ({memberIds.length} selected)
              </Label>
              <Input
                id="department-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or number"
                value={search}
              />
              <ul className="mt-2 max-h-52 divide-y divide-border/60 overflow-y-auto rounded-md border border-border">
                {listed.map((employee) => (
                  <li key={employee.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                      <input
                        checked={memberIds.includes(employee.id)}
                        onChange={() => toggle(employee.id)}
                        type="checkbox"
                      />
                      <span className="text-foreground">{employeeDisplayName(employee)}</span>
                      <span className="text-muted-foreground">{employee.employeeNumber}</span>
                    </label>
                  </li>
                ))}
                {listed.length === 0 && (
                  <li className="px-3 py-3 text-xs text-muted-foreground">No employees match.</li>
                )}
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Someone already in another department moves here. The head is added automatically.
              </p>
            </div>
          )}

          {departments.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {departments.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || !prefixValid || departments.saving}
              onClick={() => void submit()}
              type="button"
            >
              {departments.saving ? 'Saving…' : department ? 'Save' : 'Create department'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
