'use client';

import React, { useState, useEffect } from 'react';
import type {
  AssignmentProject,
  AssignmentTeam,
  EmployeeProjectAssignment,
} from '../../repositories/assignment.repository';
import { assignmentRepository } from '../../repositories/assignment.repository';
import type { EmployeeDetailData } from './entity-detail-drawer';
import { Button, Checkbox, Dialog, DialogContent, Input, Label } from '@smarteam/ui';

interface AssignEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: EmployeeDetailData;
  onAssignmentsUpdated?: (updatedEmployee: EmployeeDetailData) => void;
}

export function AssignEmployeeModal({
  isOpen,
  onClose,
  employee,
  onAssignmentsUpdated,
}: AssignEmployeeModalProps) {
  const [availableTeams, setAvailableTeams] = useState<AssignmentTeam[]>([]);
  const [availableProjects, setAvailableProjects] = useState<AssignmentProject[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [projectAllocations, setProjectAllocations] = useState<EmployeeProjectAssignment[]>([]);
  const [isSavedToast, setIsSavedToast] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const teams = assignmentRepository.getTeams();
      const projects = assignmentRepository.getProjects();
      const initial = assignmentRepository.getEmployeeAssignments(
        employee.id,
        employee.employeeNumber,
      );

      setAvailableTeams(teams);
      setAvailableProjects(projects);
      setSelectedTeamIds(initial.teamIds);
      setProjectAllocations(initial.projectAllocations);
      setIsSavedToast(false);
    }
  }, [isOpen, employee]);

  if (!isOpen) return null;

  const totalAllocation = projectAllocations.reduce(
    (sum, p) => sum + (p.allocationPercentage || 0),
    0,
  );

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    );
  };

  const toggleProject = (projectId: string) => {
    setProjectAllocations((prev) => {
      const exists = prev.find((p) => p.projectId === projectId);
      if (exists) {
        return prev.filter((p) => p.projectId !== projectId);
      } else {
        return [
          ...prev,
          {
            projectId,
            role: 'Contributor',
            allocationPercentage: Math.max(10, Math.min(100 - totalAllocation, 50)),
          },
        ];
      }
    });
  };

  const updateProjectRole = (projectId: string, role: string) => {
    setProjectAllocations((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, role } : p)),
    );
  };

  const updateProjectAllocation = (projectId: string, allocationPercentage: number) => {
    setProjectAllocations((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, allocationPercentage } : p)),
    );
  };

  const handleSave = () => {
    if (totalAllocation > 100) return;
    assignmentRepository.saveEmployeeAssignments(
      {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        jobTitle: employee.jobTitle,
      },
      selectedTeamIds,
      projectAllocations,
    );

    // Build updated employee detail object
    const updatedTeams = availableTeams
      .filter((t) => selectedTeamIds.includes(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        isLead: t.teamLeadEmployeeId === employee.id,
      }));

    const updatedProjects = projectAllocations.map((alloc) => {
      const proj = availableProjects.find((p) => p.id === alloc.projectId);
      return {
        id: alloc.projectId,
        code: proj?.code || 'PROJ',
        name: proj?.name || 'Assigned Project',
        role: alloc.role,
        allocationPercentage: alloc.allocationPercentage,
      };
    });

    const updatedEmployee: EmployeeDetailData = {
      ...employee,
      teams: updatedTeams,
      projects: updatedProjects,
    };

    onAssignmentsUpdated?.(updatedEmployee);
    setIsSavedToast(true);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-800 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0">
              {employee.avatarInitials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 !m-0">
                  Manage Assignments: {employee.firstName} {employee.lastName}
                </h2>
                <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded">
                  {employee.employeeNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {employee.jobTitle} · {employee.department}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close assignment dialog"
          >
            ✕
          </Button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
          {/* Toast alert */}
          {isSavedToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-[6px] text-xs font-semibold flex items-center gap-2">
              <span>✓</span> Assignments updated and persisted successfully!
            </div>
          )}

          {/* 1. Squads & Teams */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider !m-0">
                  1. Assign to Cross-Functional Squads
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select which functional teams this staff member belongs to.
                </p>
              </div>
              <span className="text-xs font-bold bg-sky-50 text-primary px-2.5 py-1 rounded-[4px] border border-sky-200">
                {selectedTeamIds.length} Squads Selected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availableTeams.map((team) => {
                const isSelected = selectedTeamIds.includes(team.id);
                return (
                  <label
                    key={team.id}
                    className={`p-3 rounded-[6px] border transition-all flex items-start gap-3 cursor-pointer select-none ${
                      isSelected
                        ? 'bg-sky-50/60 border-sky-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleTeam(team.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{team.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        📍 {team.branchName} · {team.memberCount} members
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 2. Projects & Work Allocations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider !m-0">
                  2. Project Work & Capacity Allocations
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Assign projects and define capacity allocation percentages.
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded-[4px] border ${
                    totalAllocation > 100
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : totalAllocation === 100
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Total: {totalAllocation}% Capacity
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {availableProjects.map((proj) => {
                const alloc = projectAllocations.find((p) => p.projectId === proj.id);
                const isSelected = !!alloc;

                return (
                  <div
                    key={proj.id}
                    className={`p-3.5 rounded-[6px] border transition-all ${
                      isSelected
                        ? 'bg-white border-sky-400 shadow-xs ring-1 ring-sky-200'
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleProject(proj.id)}
                        />
                        <div>
                          <span className="text-xs font-bold text-slate-900">{proj.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 ml-2">
                            ({proj.code})
                          </span>
                        </div>
                      </label>

                      {isSelected && (
                        <span className="text-xs font-mono font-bold text-primary">
                          {alloc.allocationPercentage}%
                        </span>
                      )}
                    </div>

                    {alloc && (
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label
                            htmlFor={`assignment-role-${proj.id}`}
                            className="mb-1 block uppercase tracking-wider"
                          >
                            Project Role
                          </Label>
                          <Input
                            id={`assignment-role-${proj.id}`}
                            value={alloc.role}
                            onChange={(e) => updateProjectRole(proj.id, e.target.value)}
                            placeholder="e.g. Frontend Lead, Contributor"
                            className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>

                        <div>
                          <Label
                            htmlFor={`assignment-allocation-${proj.id}`}
                            className="mb-1 block uppercase tracking-wider"
                          >
                            Allocation Percentage ({alloc.allocationPercentage}%)
                          </Label>
                          <input
                            id={`assignment-allocation-${proj.id}`}
                            type="range"
                            min="10"
                            max="100"
                            step="5"
                            value={alloc.allocationPercentage}
                            onChange={(e) =>
                              updateProjectAllocation(proj.id, parseInt(e.target.value, 10))
                            }
                            className="w-full accent-primary cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            {totalAllocation > 100 && (
              <span className="text-rose-600 font-semibold">
                ⚠️ Warning: Total allocation exceeds 100%
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={totalAllocation > 100}>
              Save Assignments
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
