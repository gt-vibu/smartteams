'use client';

import React, { useState } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { AssignEmployeeModal } from './assign-employee-modal';

export interface EmployeeDetailData {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  jobTitle: string;
  department: string;
  branchName: string;
  avatarInitials: string;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  manager: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
  } | null;
  teams: Array<{
    id: string;
    name: string;
    isLead: boolean;
  }>;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    role: string;
    allocationPercentage: number;
  }>;
  directReports?: Array<{
    id: string;
    employeeNumber: string;
    name: string;
    jobTitle: string;
  }>;
}

interface EntityDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  employee?: EmployeeDetailData | null;
}

export function EntityDetailDrawer({
  isOpen,
  onClose,
  employee: initialEmployee,
}: EntityDetailDrawerProps) {
  const { hasPermission, persona } = useAuth();
  const canManageAssignments =
    hasPermission('*') ||
    hasPermission('teams.write') ||
    hasPermission('projects.write') ||
    persona.badge.includes('Admin');

  const [employee, setEmployee] = useState<EmployeeDetailData | null>(initialEmployee || null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  React.useEffect(() => {
    setEmployee(initialEmployee || null);
  }, [initialEmployee]);

  if (!isOpen || !employee) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex justify-end animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-50 overflow-hidden animate-in slide-in-from-right duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50/70">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-full bg-slate-800 text-white font-bold text-base flex items-center justify-center border-2 border-white shadow-xs">
                {employee.avatarUrl ? (
                  <img
                    src={employee.avatarUrl}
                    alt={employee.firstName}
                    className="h-full w-full object-cover rounded-full"
                  />
                ) : (
                  employee.avatarInitials
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 !m-0">
                    {employee.firstName} {employee.lastName}
                  </h2>
                  <span className="text-[10px] font-mono text-slate-500 font-semibold bg-slate-200/70 px-1.5 py-0.2 rounded">
                    {employee.employeeNumber}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{employee.jobTitle}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors cursor-pointer"
              title="Close Drawer"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Admin Assignment Banner Action */}
          {canManageAssignments && (
            <div className="px-5 py-2.5 bg-gradient-to-r from-sky-50 to-indigo-50 border-b border-sky-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-sky-900 font-semibold">
                <span>⚡ Admin Action:</span>
                <span className="text-[11px] font-normal text-sky-700">
                  Manage Squads & Allocations
                </span>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="px-2.5 py-1 bg-[#0284C7] hover:bg-[#0369A1] text-white text-[11px] font-bold rounded shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>⚙ Assign</span>
              </button>
            </div>
          )}

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
            {/* Department & Branch Meta */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-[6px] border border-slate-200/80 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Department
                </span>
                <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                  {employee.department}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Location / Branch
                </span>
                <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                  {employee.branchName}
                </span>
              </div>
            </div>

            {/* 1. First-Class Relationships: Reporting Line */}
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Reporting Manager</span>
                <span className="text-[10px] text-slate-400 normal-case font-normal">
                  Hierarchy
                </span>
              </h3>
              {employee.manager ? (
                <div className="p-3 bg-white border border-slate-200 rounded-[6px] shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                      {employee.manager.firstName[0]}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900">
                        {employee.manager.firstName} {employee.manager.lastName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {employee.manager.jobTitle} · {employee.manager.employeeNumber}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Reports To
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-[6px] text-xs text-slate-500 italic">
                  Head of Organization / No reporting manager assigned
                </div>
              )}
            </div>

            {/* 2. Direct Reports (if any) */}
            {employee.directReports && employee.directReports.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Direct Reports ({employee.directReports.length})</span>
                  <span className="text-[10px] text-slate-400 normal-case font-normal">
                    Team Lead
                  </span>
                </h3>
                <div className="space-y-1.5">
                  {employee.directReports.map((dr) => (
                    <div
                      key={dr.id}
                      className="p-2.5 bg-white border border-slate-200 rounded-[6px] flex items-center justify-between shadow-xs"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{dr.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {dr.jobTitle} · {dr.employeeNumber}
                        </div>
                      </div>
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                        Direct Report
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Assigned Squads & Teams */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider !m-0">
                  Assigned Teams & Squads ({employee.teams.length})
                </h3>
                {canManageAssignments && (
                  <button
                    onClick={() => setIsAssignModalOpen(true)}
                    className="text-[10px] font-bold text-[#0284C7] hover:underline cursor-pointer"
                  >
                    + Assign Squad
                  </button>
                )}
              </div>
              {employee.teams.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-[6px] text-xs text-slate-500 italic">
                  Not currently assigned to any cross-functional squad
                </div>
              ) : (
                <div className="space-y-1.5">
                  {employee.teams.map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 bg-white border border-slate-200 rounded-[6px] flex items-center justify-between shadow-xs"
                    >
                      <span className="text-xs font-semibold text-slate-800">{t.name}</span>
                      {t.isLead ? (
                        <span className="text-[9px] font-bold uppercase bg-sky-50 text-[#0284C7] border border-sky-200 px-2 py-0.5 rounded">
                          Team Lead
                        </span>
                      ) : (
                        <span className="text-[9px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                          Member
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Projects & Work Allocations */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider !m-0">
                  Project Allocations
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 font-semibold">
                    Total: {employee.projects.reduce((acc, p) => acc + p.allocationPercentage, 0)}%
                  </span>
                  {canManageAssignments && (
                    <button
                      onClick={() => setIsAssignModalOpen(true)}
                      className="text-[10px] font-bold text-[#0284C7] hover:underline cursor-pointer"
                    >
                      + Allocate
                    </button>
                  )}
                </div>
              </div>
              {employee.projects.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-[6px] text-xs text-slate-500 italic">
                  No active project allocations
                </div>
              ) : (
                <div className="space-y-2.5">
                  {employee.projects.map((proj) => (
                    <div
                      key={proj.id}
                      className="p-3 bg-white border border-slate-200 rounded-[6px] shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{proj.name}</span>
                          <span className="text-[10px] text-slate-400 ml-1.5 font-mono">
                            ({proj.code})
                          </span>
                        </div>
                        <span className="font-mono font-bold text-slate-800">
                          {proj.allocationPercentage}%
                        </span>
                      </div>

                      {/* Visual Allocation Progress Bar */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sky-500 to-indigo-600 rounded-full"
                          style={{ width: `${Math.min(100, proj.allocationPercentage)}%` }}
                        />
                      </div>

                      <div className="text-[10px] text-slate-500">
                        Project Role:{' '}
                        <span className="font-semibold text-slate-700">{proj.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tax & Statutory Identity */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Tax & Statutory Identity
                </span>
                <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono">
                  Tax Year 2026-27
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#161B22] rounded-[6px] border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">PAN Number:</span>
                  <span className="font-bold text-slate-900 dark:text-white">AAAPM0192L</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">UAN / EPF Number:</span>
                  <span className="font-bold text-slate-900 dark:text-white">101928374650</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Tax Regime:</span>
                  <span className="font-sans font-semibold text-emerald-600 dark:text-emerald-400">
                    New Regime (Sec 115BAC)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Professional Tax:</span>
                  <span>₹200 / month</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">TDS Withholding:</span>
                  <span>10% Statutory</span>
                </div>
              </div>
            </div>

            {/* Contact Details */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Work Email</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {employee.workEmail}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active Staff
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-[#262F3D] bg-slate-50 dark:bg-[#161B22] flex items-center justify-between">
            {canManageAssignments ? (
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-950/70 text-[#0284C7] dark:text-[#38BDF8] border border-sky-200 dark:border-sky-800 text-xs font-bold rounded-[4px] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>⚙ Edit Assignments</span>
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold rounded-[4px] border border-transparent dark:border-slate-700 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Assignment Modal */}
      {isAssignModalOpen && (
        <AssignEmployeeModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          employee={employee}
          onAssignmentsUpdated={(updated) => setEmployee(updated)}
        />
      )}
    </>
  );
}
