'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';
import { type Department, type Employee } from '@smarteam/contracts';
import type { DepartmentsState } from '../../hooks/use-departments';
import { EmployeePicker } from '../common/employee-picker';
import { EmployeeCombobox } from '../common/employee-combobox';

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
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(department?.name ?? '');
    setPrefix(department?.employeeNumberPrefix ?? '');
    setHeadId(department?.head?.id ?? NO_HEAD);
    setMemberIds(department?.members.map((member) => member.id) ?? []);
    departments.clearError();
    // Reset only when the dialog opens or targets another department.
  }, [open, department?.id]);

  const cleanPrefix = prefix.trim().toUpperCase();
  const prefixValid = cleanPrefix === '' || /^[A-Z0-9]{1,6}$/.test(cleanPrefix);
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
      <DialogContent
        className="sm:max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          if (!department) return;
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogTitle
          className="sticky top-[-1.25rem] z-20 -mx-5 -mt-5 bg-card px-5 pt-5 pb-3"
          ref={titleRef}
          tabIndex={department ? -1 : undefined}
        >
          {department ? `Edit ${department.name}` : 'New department'}
        </DialogTitle>
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
            <EmployeeCombobox
              employees={employees}
              value={headId === NO_HEAD ? '' : headId}
              onChange={(id) => setHeadId(id || NO_HEAD)}
              noneLabel="No head"
              disabled={departments.saving}
            />
          </div>

          {showMembers && (
            <div>
              <Label className="mb-1 block" htmlFor="department-search">
                Employees ({memberIds.length} selected)
              </Label>
              <EmployeePicker
                employees={employees}
                selected={memberIds}
                onChange={setMemberIds}
                disabled={departments.saving}
              />
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
          <div className="sticky bottom-[-1.25rem] z-20 -mx-5 -mb-5 flex justify-end gap-2 bg-card px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
