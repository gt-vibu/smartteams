'use client';

import React, { useState } from 'react';

export interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  jobTitle: string;
  avatarInitials: string;
}

export const AVAILABLE_EMPLOYEES: EmployeeOption[] = [
  { id: 'emp-001', firstName: 'Arjun', lastName: 'Mehta', employeeNumber: 'EMP-001', jobTitle: 'Senior Frontend Engineer', avatarInitials: 'AM' },
  { id: 'emp-002', firstName: 'Priya', lastName: 'Sharma', employeeNumber: 'EMP-002', jobTitle: 'UI/UX Designer', avatarInitials: 'PS' },
  { id: 'emp-003', firstName: 'Rahul', lastName: 'Verma', employeeNumber: 'EMP-003', jobTitle: 'React Developer', avatarInitials: 'RV' },
  { id: 'emp-004', firstName: 'Sneha', lastName: 'Patil', employeeNumber: 'EMP-004', jobTitle: 'React Developer', avatarInitials: 'SP' },
  { id: 'emp-005', firstName: 'Kiran', lastName: 'Nair', employeeNumber: 'EMP-005', jobTitle: 'QA Engineer', avatarInitials: 'KN' },
  { id: 'emp-006', firstName: 'Divya', lastName: 'Reddy', employeeNumber: 'EMP-006', jobTitle: 'Frontend Developer', avatarInitials: 'DR' },
  { id: 'emp-010', firstName: 'Rohan', lastName: 'Das', employeeNumber: 'EMP-010', jobTitle: 'Principal Engineer', avatarInitials: 'RD' },
  { id: 'emp-011', firstName: 'Meera', lastName: 'Iyer', employeeNumber: 'EMP-011', jobTitle: 'Backend Engineer', avatarInitials: 'MI' },
  { id: 'emp-012', firstName: 'Suresh', lastName: 'Babu', employeeNumber: 'EMP-012', jobTitle: 'Backend Engineer', avatarInitials: 'SB' },
  { id: 'emp-013', firstName: 'Lakshmi', lastName: 'Pillai', employeeNumber: 'EMP-013', jobTitle: 'Database Engineer', avatarInitials: 'LP' },
  { id: 'emp-014', firstName: 'Harish', lastName: 'Rao', employeeNumber: 'EMP-014', jobTitle: 'DevOps Engineer', avatarInitials: 'HR' },
  { id: 'emp-015', firstName: 'Nalini', lastName: 'Bose', employeeNumber: 'EMP-015', jobTitle: 'Security Engineer', avatarInitials: 'NB' },
  { id: 'emp-020', firstName: 'Kavita', lastName: 'Joshi', employeeNumber: 'EMP-020', jobTitle: 'Head of Product', avatarInitials: 'KJ' },
  { id: 'emp-021', firstName: 'Aditya', lastName: 'Ghosh', employeeNumber: 'EMP-021', jobTitle: 'Product Manager', avatarInitials: 'AG' },
  { id: 'emp-022', firstName: 'Ritu', lastName: 'Malhotra', employeeNumber: 'EMP-022', jobTitle: 'UX Researcher', avatarInitials: 'RM' },
  { id: 'emp-030', firstName: 'Pooja', lastName: 'Agarwal', employeeNumber: 'EMP-030', jobTitle: 'Marketing Manager', avatarInitials: 'PA' },
  { id: 'emp_064', firstName: 'Mithun', lastName: 'Gowda H', employeeNumber: 'EMP-064', jobTitle: 'Software Engineer', avatarInitials: 'MG' },
  { id: 'emp_009', firstName: 'Ranjith', lastName: 'Kumar C', employeeNumber: 'EMP-009', jobTitle: 'Engineering Manager', avatarInitials: 'RK' },
];

export const BRANCH_OPTIONS = [
  { id: 'branch-hq', name: 'HQ – Bengaluru' },
  { id: 'branch-mum', name: 'Mumbai Office' },
  { id: 'branch-del', name: 'Delhi Office' },
];

export interface CreateTeamPayload {
  name: string;
  description: string;
  branchId: string;
  branchName: string;
  teamLeadEmployeeId: string;
  status: 'ACTIVE' | 'ARCHIVED';
  memberEmployeeIds: string[];
}

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateTeamPayload) => void;
}

export function CreateTeamModal({ isOpen, onClose, onSubmit }: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(BRANCH_OPTIONS[0]?.id || '');
  const [teamLeadId, setTeamLeadId] = useState(AVAILABLE_EMPLOYEES[0]?.id || '');
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    AVAILABLE_EMPLOYEES[0]?.id ? [AVAILABLE_EMPLOYEES[0].id] : []
  );
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleToggleMember = (empId: string) => {
    if (selectedMemberIds.includes(empId)) {
      if (selectedMemberIds.length === 1) return; // keep at least one
      setSelectedMemberIds(selectedMemberIds.filter((id) => id !== empId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, empId]);
    }
  };

  const handleLeadChange = (empId: string) => {
    setTeamLeadId(empId);
    if (!selectedMemberIds.includes(empId)) {
      setSelectedMemberIds([...selectedMemberIds, empId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Team name is required');
      return;
    }

    const branch = BRANCH_OPTIONS.find((b) => b.id === branchId) || BRANCH_OPTIONS[0];

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      branchId: branch?.id || '',
      branchName: branch?.name || '',
      teamLeadEmployeeId: teamLeadId,
      status,
      memberEmployeeIds: selectedMemberIds,
    });

    // Reset & Close
    setName('');
    setDescription('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative bg-white rounded-[8px] max-w-lg w-full p-6 shadow-2xl border border-slate-200 z-10 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Create New Team</h2>
            <p className="text-xs text-slate-500 mt-0.5">Define team details, reporting manager (lead), and assign initial members.</p>
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

          {/* 1. Team Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Team Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Platform Core, Quality Assurance"
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] focus:border-[#0284C7] focus:bg-white transition-all font-medium text-slate-800"
            />
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
              placeholder="Brief description of the team's mission and responsibilities..."
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] focus:border-[#0284C7] focus:bg-white transition-all text-slate-800 resize-none"
            />
          </div>

          {/* 3. Branch & Status in Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Branch */}
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

            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'ARCHIVED')}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] text-slate-800 font-medium"
              >
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          {/* 4. Team Lead / Reporting Manager */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Team Lead / Reporting Manager <span className="text-rose-500">*</span>
            </label>
            <select
              value={teamLeadId}
              onChange={(e) => handleLeadChange(e.target.value)}
              className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-[#0284C7] text-slate-800 font-medium"
            >
              {AVAILABLE_EMPLOYEES.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} — {emp.jobTitle} ({emp.employeeNumber})
                </option>
              ))}
            </select>
          </div>

          {/* 5. Assign Members */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Team Members ({selectedMemberIds.length} selected)
              </label>
              <span className="text-[10px] text-slate-400">Click to add/remove</span>
            </div>
            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-[6px] p-2 bg-slate-50/50 space-y-1">
              {AVAILABLE_EMPLOYEES.map((emp) => {
                const isSelected = selectedMemberIds.includes(emp.id);
                const isLead = teamLeadId === emp.id;
                return (
                  <div
                    key={emp.id}
                    onClick={() => handleToggleMember(emp.id)}
                    className={`flex items-center justify-between p-1.5 rounded-[4px] text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50 border border-sky-200 text-sky-900 font-semibold'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                        {emp.avatarInitials}
                      </span>
                      <span className="truncate">{emp.firstName} {emp.lastName}</span>
                      <span className="text-[10px] text-slate-400 truncate">({emp.jobTitle})</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {isLead && (
                        <span className="text-[9px] bg-[#0284C7] text-white px-1.5 py-0.2 rounded font-bold uppercase">
                          Lead
                        </span>
                      )}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by row click
                        className="rounded border-slate-300 text-[#0284C7] focus:ring-0 cursor-pointer h-3.5 w-3.5"
                      />
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
              <span>Create Team</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
