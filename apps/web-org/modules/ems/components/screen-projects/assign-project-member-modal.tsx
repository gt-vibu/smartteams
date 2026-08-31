'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Button,
  Label,
  Input,
  Select,
  DatePicker,
} from '@smarteam/ui';
import type { ProjectData } from './screen-projects';
import { AVAILABLE_EMPLOYEES } from '../screen-teams/create-team-modal';

export interface AssignProjectMemberPayload {
  projectId: string;
  employeeId: string;
  projectRole: string;
  allocationPercentage: number;
  startsOn: string;
  endsOn: string | null;
}

interface AssignProjectMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: ProjectData | null;
  projects?: ProjectData[];
  selectedProjectId?: string;
  onAssign: (payload: AssignProjectMemberPayload) => void;
}

const COMMON_ROLES = [
  'Tech Lead',
  'Senior Developer',
  'Frontend Developer',
  'Backend Developer',
  'UI/UX Designer',
  'QA Engineer',
  'DevOps Specialist',
  'Project Manager',
];

export function AssignProjectMemberModal({
  isOpen,
  onClose,
  project,
  projects = [],
  selectedProjectId: initialSelectedProjectId,
  onAssign,
}: AssignProjectMemberModalProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    project?.id || initialSelectedProjectId || projects[0]?.id || '',
  );
  const [employeeId, setEmployeeId] = useState<string>(AVAILABLE_EMPLOYEES[0]?.id || '');
  const [role, setRole] = useState<string>(COMMON_ROLES[1]!);
  const [allocation, setAllocation] = useState<number>(100);
  const [startsOn, setStartsOn] = useState<string>(new Date().toISOString().slice(0, 10));
  const [endsOn, setEndsOn] = useState<string>('');

  const currentProject = project || projects.find((p) => p.id === selectedProjectId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !currentProject) return;

    onAssign({
      projectId: currentProject.id,
      employeeId,
      projectRole: role,
      allocationPercentage: allocation,
      startsOn,
      endsOn: endsOn || null,
    });
    onClose();
  };

  const selectedEmp = AVAILABLE_EMPLOYEES.find((e) => e.id === employeeId);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
              👤
            </span>
            <DialogTitle>Assign Staff to Project</DialogTitle>
          </div>
          <DialogDescription>
            {project ? (
              <>
                Assign workforce member to{' '}
                <strong className="text-slate-900 dark:text-white">{project.name}</strong> (
                {project.code}).
              </>
            ) : (
              'Select project, team member, role, and capacity allocation.'
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
          {/* 1. Project Selector (if not pre-fixed) */}
          {!project && projects.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="assign-proj-select">
                Target Project <span className="text-rose-500">*</span>
              </Label>
              <Select
                id="assign-proj-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* 2. Employee Selector */}
          <div className="space-y-1">
            <Label htmlFor="assign-emp-select">
              Workforce Member <span className="text-rose-500">*</span>
            </Label>
            <Select
              id="assign-emp-select"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {AVAILABLE_EMPLOYEES.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} — {emp.jobTitle} ({emp.employeeNumber})
                </option>
              ))}
            </Select>
          </div>

          {/* 3. Project Role */}
          <div className="space-y-1">
            <Label htmlFor="assign-role-input">
              Project Role / Responsibility <span className="text-rose-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="assign-role-input"
                type="text"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Lead Architect"
              />
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) setRole(e.target.value);
                }}
                className="w-40 shrink-0"
              >
                <option value="">Presets...</option>
                {COMMON_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* 4. Allocation Percentage */}
          <div className="bg-slate-50 dark:bg-card p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Staffing Allocation:</Label>
              <span className="font-mono font-bold text-xs text-primary bg-white dark:bg-card border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded">
                {allocation}% Time Commitment
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="10"
              value={allocation}
              onChange={(e) => setAllocation(Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>10% (Advisory)</span>
              <span>50% (Part-time)</span>
              <span>100% (Dedicated)</span>
            </div>
          </div>

          {/* 5. Start & End Dates with shadcn DatePicker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                Effective Start Date <span className="text-rose-500">*</span>
              </Label>
              <DatePicker
                value={startsOn}
                onChange={(d) => setStartsOn(d)}
                placeholder="Start Date"
              />
            </div>
            <div className="space-y-1">
              <Label>Release Date (Optional)</Label>
              <DatePicker value={endsOn} onChange={(d) => setEndsOn(d)} placeholder="End Date" />
            </div>
          </div>

          {/* Preview Note */}
          {selectedEmp && currentProject && (
            <div className="p-2.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-md text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
              Assigning{' '}
              <strong className="text-slate-900 dark:text-white">
                {selectedEmp.firstName} {selectedEmp.lastName}
              </strong>{' '}
              as <strong>{role}</strong> ({allocation}% allocation) to{' '}
              <strong>{currentProject.name}</strong>.
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Confirm Assignment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
