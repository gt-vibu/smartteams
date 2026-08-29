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
} from '@smarteam/ui';

export interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  jobTitle: string;
  avatarInitials: string;
}

export const AVAILABLE_EMPLOYEES: EmployeeOption[] = [
  {
    id: 'emp-001',
    firstName: 'Arjun',
    lastName: 'Mehta',
    employeeNumber: 'EMP-001',
    jobTitle: 'Senior Frontend Engineer',
    avatarInitials: 'AM',
  },
  {
    id: 'emp-002',
    firstName: 'Priya',
    lastName: 'Sharma',
    employeeNumber: 'EMP-002',
    jobTitle: 'UI/UX Designer',
    avatarInitials: 'PS',
  },
  {
    id: 'emp-003',
    firstName: 'Rahul',
    lastName: 'Verma',
    employeeNumber: 'EMP-003',
    jobTitle: 'React Developer',
    avatarInitials: 'RV',
  },
  {
    id: 'emp-004',
    firstName: 'Sneha',
    lastName: 'Patil',
    employeeNumber: 'EMP-004',
    jobTitle: 'React Developer',
    avatarInitials: 'SP',
  },
  {
    id: 'emp-005',
    firstName: 'Kiran',
    lastName: 'Nair',
    employeeNumber: 'EMP-005',
    jobTitle: 'QA Engineer',
    avatarInitials: 'KN',
  },
  {
    id: 'emp-006',
    firstName: 'Divya',
    lastName: 'Reddy',
    employeeNumber: 'EMP-006',
    jobTitle: 'Frontend Developer',
    avatarInitials: 'DR',
  },
  {
    id: 'emp-010',
    firstName: 'Rohan',
    lastName: 'Das',
    employeeNumber: 'EMP-010',
    jobTitle: 'Principal Engineer',
    avatarInitials: 'RD',
  },
  {
    id: 'emp-011',
    firstName: 'Meera',
    lastName: 'Iyer',
    employeeNumber: 'EMP-011',
    jobTitle: 'Backend Engineer',
    avatarInitials: 'MI',
  },
  {
    id: 'emp-012',
    firstName: 'Suresh',
    lastName: 'Babu',
    employeeNumber: 'EMP-012',
    jobTitle: 'Backend Engineer',
    avatarInitials: 'SB',
  },
  {
    id: 'emp-013',
    firstName: 'Lakshmi',
    lastName: 'Pillai',
    employeeNumber: 'EMP-013',
    jobTitle: 'Database Engineer',
    avatarInitials: 'LP',
  },
  {
    id: 'emp-014',
    firstName: 'Harish',
    lastName: 'Rao',
    employeeNumber: 'EMP-014',
    jobTitle: 'DevOps Engineer',
    avatarInitials: 'HR',
  },
  {
    id: 'emp-015',
    firstName: 'Nalini',
    lastName: 'Bose',
    employeeNumber: 'EMP-015',
    jobTitle: 'Security Engineer',
    avatarInitials: 'NB',
  },
  {
    id: 'emp-020',
    firstName: 'Kavita',
    lastName: 'Joshi',
    employeeNumber: 'EMP-020',
    jobTitle: 'Head of Product',
    avatarInitials: 'KJ',
  },
  {
    id: 'emp-021',
    firstName: 'Aditya',
    lastName: 'Ghosh',
    employeeNumber: 'EMP-021',
    jobTitle: 'Product Manager',
    avatarInitials: 'AG',
  },
  {
    id: 'emp-022',
    firstName: 'Ritu',
    lastName: 'Malhotra',
    employeeNumber: 'EMP-022',
    jobTitle: 'UX Researcher',
    avatarInitials: 'RM',
  },
  {
    id: 'emp-030',
    firstName: 'Pooja',
    lastName: 'Agarwal',
    employeeNumber: 'EMP-030',
    jobTitle: 'Marketing Manager',
    avatarInitials: 'PA',
  },
  {
    id: 'emp_064',
    firstName: 'Mithun',
    lastName: 'Gowda H',
    employeeNumber: 'EMP-064',
    jobTitle: 'Software Engineer',
    avatarInitials: 'MG',
  },
  {
    id: 'emp_009',
    firstName: 'Ranjith',
    lastName: 'Kumar C',
    employeeNumber: 'EMP-009',
    jobTitle: 'Engineering Manager',
    avatarInitials: 'RK',
  },
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
    AVAILABLE_EMPLOYEES[0]?.id ? [AVAILABLE_EMPLOYEES[0].id] : [],
  );
  const [error, setError] = useState('');

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
              👥
            </span>
            <DialogTitle>Create New Team</DialogTitle>
          </div>
          <DialogDescription>
            Define team details, reporting manager (lead), and assign initial members.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
          {error && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-md text-xs text-rose-700 dark:text-rose-300 font-medium">
              {error}
            </div>
          )}

          {/* 1. Team Name */}
          <div className="space-y-1">
            <Label htmlFor="team-name-input">
              Team Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="team-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Platform Core, Quality Assurance"
            />
          </div>

          {/* 2. Description */}
          <div className="space-y-1">
            <Label htmlFor="team-desc-textarea">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="team-desc-textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the team's mission and responsibilities..."
            />
          </div>

          {/* 3. Branch & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="team-branch-select">Branch Location</Label>
              <Select
                id="team-branch-select"
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

            <div className="space-y-1">
              <Label htmlFor="team-status-select">Initial Status</Label>
              <Select
                id="team-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'ARCHIVED')}
              >
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </div>
          </div>

          {/* 4. Team Lead */}
          <div className="space-y-1">
            <Label htmlFor="team-lead-select">
              Team Lead / Reporting Manager <span className="text-rose-500">*</span>
            </Label>
            <Select
              id="team-lead-select"
              value={teamLeadId}
              onChange={(e) => handleLeadChange(e.target.value)}
            >
              {AVAILABLE_EMPLOYEES.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} — {emp.jobTitle} ({emp.employeeNumber})
                </option>
              ))}
            </Select>
          </div>

          {/* 5. Assign Members */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Team Members ({selectedMemberIds.length} selected)</Label>
              <span className="text-[10px] text-slate-400">Click to add/remove</span>
            </div>
            <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md p-2 bg-slate-50/50 dark:bg-[#161B22] space-y-1">
              {AVAILABLE_EMPLOYEES.map((emp) => {
                const isSelected = selectedMemberIds.includes(emp.id);
                const isLead = teamLeadId === emp.id;
                return (
                  <div
                    key={emp.id}
                    onClick={() => handleToggleMember(emp.id)}
                    className={`flex items-center justify-between p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-300 font-semibold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-sky-700 text-white text-[9px] font-bold flex items-center justify-center">
                        {emp.avatarInitials}
                      </div>
                      <span>
                        {emp.firstName} {emp.lastName}
                      </span>
                      <span className="text-[10px] text-slate-400">({emp.jobTitle})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isLead && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                          Lead
                        </span>
                      )}
                      <span className="text-xs">{isSelected ? '✓' : '+'}</span>
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
              Create Team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
