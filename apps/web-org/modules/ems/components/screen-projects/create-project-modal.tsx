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
  Textarea,
  DatePicker,
} from '@smarteam/ui';
import { AVAILABLE_EMPLOYEES, BRANCH_OPTIONS } from '../screen-teams/create-team-modal';

export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';

export interface AssignedMemberInput {
  employeeId: string;
  projectRole: string;
  allocationPercentage: number;
}

export interface CreateProjectPayload {
  code: string;
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  branchId: string;
  branchName: string;
  members: AssignedMemberInput[];
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateProjectPayload) => void;
}

export function CreateProjectModal({ isOpen, onClose, onSubmit }: CreateProjectModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [branchId, setBranchId] = useState(BRANCH_OPTIONS[0]?.id || '');
  const [assignedMembers, setAssignedMembers] = useState<
    Record<string, { selected: boolean; role: string; allocation: number }>
  >(() => {
    const initial: Record<string, { selected: boolean; role: string; allocation: number }> = {};
    if (AVAILABLE_EMPLOYEES[0]?.id) {
      initial[AVAILABLE_EMPLOYEES[0].id] = { selected: true, role: 'Tech Lead', allocation: 100 };
    }
    if (AVAILABLE_EMPLOYEES[1]?.id) {
      initial[AVAILABLE_EMPLOYEES[1].id] = {
        selected: true,
        role: 'UI/UX Designer',
        allocation: 80,
      };
    }
    return initial;
  });
  const [error, setError] = useState('');

  const handleToggleMember = (empId: string) => {
    const current = assignedMembers[empId];
    if (current && current.selected) {
      setAssignedMembers({
        ...assignedMembers,
        [empId]: { ...current, selected: false },
      });
    } else {
      setAssignedMembers({
        ...assignedMembers,
        [empId]: {
          selected: true,
          role: current?.role || 'Developer',
          allocation: current?.allocation || 100,
        },
      });
    }
  };

  const handleUpdateRole = (empId: string, role: string) => {
    const current = assignedMembers[empId] || {
      selected: true,
      role: 'Developer',
      allocation: 100,
    };
    setAssignedMembers({
      ...assignedMembers,
      [empId]: { ...current, role },
    });
  };

  const handleUpdateAllocation = (empId: string, allocation: number) => {
    const current = assignedMembers[empId] || {
      selected: true,
      role: 'Developer',
      allocation: 100,
    };
    setAssignedMembers({
      ...assignedMembers,
      [empId]: { ...current, allocation: Math.min(100, Math.max(0, allocation)) },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Project code is required (e.g. PRJ-01)');
      return;
    }
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    const branch = BRANCH_OPTIONS.find((b) => b.id === branchId) || BRANCH_OPTIONS[0];

    const selectedList: AssignedMemberInput[] = Object.entries(assignedMembers)
      .filter(([_, val]) => val.selected)
      .map(([empId, val]) => ({
        employeeId: empId,
        projectRole: val.role.trim() || 'Contributor',
        allocationPercentage: val.allocation || 100,
      }));

    onSubmit({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim(),
      status,
      startDate: startDate || new Date().toISOString().slice(0, 10),
      endDate: endDate || '',
      branchId: branch?.id || '',
      branchName: branch?.name || '',
      members: selectedList,
    });

    // Reset & Close
    setCode('');
    setName('');
    setDescription('');
    setEndDate('');
    setError('');
    onClose();
  };

  const selectedCount = Object.values(assignedMembers).filter((m) => m.selected).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
              📁
            </span>
            <DialogTitle>Create New Project</DialogTitle>
          </div>
          <DialogDescription>
            Define project code, timeline, status, and assign members with role & allocation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
          {error && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-md text-xs text-rose-700 dark:text-rose-300 font-medium">
              {error}
            </div>
          )}

          {/* 1. Code + Name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="proj-code-input">
                Code <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proj-code-input"
                type="text"
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (error) setError('');
                }}
                placeholder="EMS-26"
                className="font-mono uppercase font-bold"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="proj-name-input">
                Project Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proj-name-input"
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Mobile Portal Redesign"
              />
            </div>
          </div>

          {/* 2. Description */}
          <div className="space-y-1">
            <Label htmlFor="proj-desc-textarea">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="proj-desc-textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="High-level objectives and business goals..."
            />
          </div>

          {/* 3. Status + Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="proj-status-select">Status</Label>
              <Select
                id="proj-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                <option value="ACTIVE">Active (In Progress)</option>
                <option value="PLANNED">Planned (Backlog)</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="proj-branch-select">Branch Location</Label>
              <Select
                id="proj-branch-select"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {BRANCH_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* 4. Timeline Dates with shadcn DatePicker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                Start Date <span className="text-rose-500">*</span>
              </Label>
              <DatePicker
                value={startDate}
                onChange={(d) => setStartDate(d)}
                placeholder="Start Date"
              />
            </div>

            <div className="space-y-1">
              <Label>
                Target End Date <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <DatePicker value={endDate} onChange={(d) => setEndDate(d)} placeholder="End Date" />
            </div>
          </div>

          {/* 5. Team Members Allocation */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Assigned Team ({selectedCount} members)</Label>
              <span className="text-[10px] text-slate-400">Select & set % allocation</span>
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-2 bg-slate-50/50 dark:bg-[#161B22] space-y-1.5">
              {AVAILABLE_EMPLOYEES.map((emp) => {
                const assigned = assignedMembers[emp.id];
                const isSelected = assigned?.selected || false;
                return (
                  <div
                    key={emp.id}
                    className={`p-2 rounded-md border text-xs transition-all ${
                      isSelected
                        ? 'bg-white dark:bg-[#1C2128] border-sky-300 dark:border-sky-700 shadow-2xs'
                        : 'bg-transparent border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div
                        onClick={() => handleToggleMember(emp.id)}
                        className="flex items-center gap-2 cursor-pointer flex-1"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded text-[#0284C7] focus:ring-0 cursor-pointer"
                        />
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {emp.firstName} {emp.lastName}
                        </span>
                        <span className="text-[10px] text-slate-400">({emp.jobTitle})</span>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={assigned?.role || 'Developer'}
                            onChange={(e) => handleUpdateRole(emp.id, e.target.value)}
                            placeholder="Role"
                            className="text-[11px] px-2 py-0.5 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-[#161B22] w-28 text-slate-800 dark:text-slate-200"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={10}
                              max={100}
                              step={10}
                              value={assigned?.allocation || 100}
                              onChange={(e) =>
                                handleUpdateAllocation(emp.id, parseInt(e.target.value, 10) || 0)
                              }
                              className="text-[11px] px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-[#161B22] w-14 text-center font-mono text-slate-800 dark:text-slate-200"
                            />
                            <span className="text-[10px] text-slate-400">%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
