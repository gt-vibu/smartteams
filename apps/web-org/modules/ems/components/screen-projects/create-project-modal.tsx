'use client';

import React, { useState } from 'react';
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
  const [assignedMembers, setAssignedMembers] = useState<Record<string, { selected: boolean; role: string; allocation: number }>>(() => {
    const initial: Record<string, { selected: boolean; role: string; allocation: number }> = {};
    if (AVAILABLE_EMPLOYEES[0]?.id) {
      initial[AVAILABLE_EMPLOYEES[0].id] = { selected: true, role: 'Tech Lead', allocation: 100 };
    }
    if (AVAILABLE_EMPLOYEES[1]?.id) {
      initial[AVAILABLE_EMPLOYEES[1].id] = { selected: true, role: 'UI/UX Designer', allocation: 80 };
    }
    return initial;
  });
  const [error, setError] = useState('');

  if (!isOpen) return null;

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
    const current = assignedMembers[empId] || { selected: true, role: 'Developer', allocation: 100 };
    setAssignedMembers({
      ...assignedMembers,
      [empId]: { ...current, role },
    });
  };

  const handleUpdateAllocation = (empId: string, allocation: number) => {
    const current = assignedMembers[empId] || { selected: true, role: 'Developer', allocation: 100 };
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
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative bg-white rounded-[8px] max-w-xl w-full p-6 shadow-2xl border border-slate-200 z-10 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Create New Project</h2>
            <p className="text-xs text-slate-500 mt-0.5">Define project code, timeline, status, and assign members with role & allocation.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-[6px] text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* 1. Code + Name in Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Project Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. EMS-26"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] focus:bg-white font-mono uppercase font-bold text-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Project Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. Mobile Portal Redesign"
                className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] focus:bg-white font-medium text-slate-800"
              />
            </div>
          </div>

          {/* 2. Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief project goals, scope, and key deliverables..."
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] focus:bg-white text-slate-800 resize-none"
            />
          </div>

          {/* 3. Status, Branch, Timeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] text-slate-800 font-medium"
              >
                <option value="PLANNED">Planned</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Branch Location
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] text-slate-800 font-medium"
              >
                {BRANCH_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] text-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Target End Date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] text-slate-800 font-medium"
              />
            </div>
          </div>

          {/* 4. Assign Project Members */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Project Team ({selectedCount} assigned)
              </label>
              <span className="text-[10px] text-slate-400">Assign role & allocation %</span>
            </div>
            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-[6px] p-2 bg-slate-50/50 space-y-1.5">
              {AVAILABLE_EMPLOYEES.map((emp) => {
                const memberState = assignedMembers[emp.id];
                const isSelected = memberState?.selected ?? false;
                const role = memberState?.role || 'Developer';
                const alloc = memberState?.allocation ?? 100;

                return (
                  <div
                    key={emp.id}
                    className={`p-2 rounded-[4px] border transition-colors ${
                      isSelected
                        ? 'bg-sky-50/70 border-sky-200 text-sky-950'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div
                        onClick={() => handleToggleMember(emp.id)}
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleMember(emp.id)}
                          className="rounded border-slate-300 text-[#0284C7] focus:ring-0 cursor-pointer h-3.5 w-3.5"
                        />
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                          {emp.avatarInitials}
                        </span>
                        <span className="text-xs font-semibold truncate">{emp.firstName} {emp.lastName}</span>
                        <span className="text-[10px] text-slate-400 truncate">({emp.employeeNumber})</span>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="text"
                            value={role}
                            onChange={(e) => handleUpdateRole(emp.id, e.target.value)}
                            placeholder="Role"
                            className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded w-28 focus:outline-none focus:ring-1 focus:ring-[#0284C7]"
                          />
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              value={alloc}
                              onChange={(e) => handleUpdateAllocation(emp.id, Number(e.target.value))}
                              className="text-[11px] px-1.5 py-0.5 bg-white border border-slate-200 rounded w-14 text-center font-bold focus:outline-none focus:ring-1 focus:ring-[#0284C7]"
                            />
                            <span className="text-[10px] text-slate-500 font-bold">%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-200 rounded-[4px] text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-[4px] shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Create Project</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
