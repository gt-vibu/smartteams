'use client';

import React, { useState } from 'react';
import { DepartmentData } from '../../types/organization.types';

interface OrgDepartmentDirectoryTabProps {
  departments: DepartmentData[];
}

export function OrgDepartmentDirectoryTab({ departments }: OrgDepartmentDirectoryTabProps) {
  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id || '');
  const [deptSearch, setDeptSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  // Filter departments by search
  const filteredDepts = departments.filter(
    (d) =>
      d.name.toLowerCase().includes(deptSearch.toLowerCase()) ||
      d.code.toLowerCase().includes(deptSearch.toLowerCase()),
  );

  const selectedDepartment = departments.find((d) => d.id === selectedDeptId) || departments[0];

  // Filter department members by search
  const filteredMembers = (selectedDepartment?.employees || []).filter((emp) => {
    const q = memberSearch.toLowerCase();
    return (
      emp.firstName.toLowerCase().includes(q) ||
      emp.lastName.toLowerCase().includes(q) ||
      emp.jobTitle.toLowerCase().includes(q) ||
      emp.employeeNumber.toLowerCase().includes(q) ||
      emp.workEmail.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white dark:bg-[#1B2028] rounded-[8px] border border-slate-200 dark:border-[#262F3D] shadow-xs overflow-hidden flex flex-col md:flex-row min-h-[580px]">
      {/* ── Left Pane: Department Search & List ── */}
      <div className="w-full md:w-72 lg:w-80 border-r border-slate-200 dark:border-[#262F3D] flex flex-col shrink-0 bg-slate-50/50 dark:bg-[#161B22]">
        {/* Search Bar */}
        <div className="p-3 border-b border-slate-200 dark:border-[#262F3D] bg-white dark:bg-[#161B22]">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={deptSearch}
              onChange={(e) => setDeptSearch(e.target.value)}
              placeholder="Search Department"
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-[#12151A] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262F3D] rounded focus:bg-white dark:focus:bg-[#1B2028] focus:outline-none focus:ring-1 focus:ring-[#0284C7]"
            />
            {deptSearch && (
              <button
                onClick={() => setDeptSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Department List Items */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredDepts.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">No matching departments</div>
          ) : (
            filteredDepts.map((dept) => {
              const isSelected = selectedDepartment?.id === dept.id;
              return (
                <button
                  key={dept.id}
                  onClick={() => {
                    setSelectedDeptId(dept.id);
                    setMemberSearch('');
                  }}
                  className={`w-full text-left p-3 rounded-[6px] transition-all flex items-center justify-between cursor-pointer border ${
                    isSelected
                      ? 'bg-sky-50/80 dark:bg-[#1E2E44] border-sky-200 dark:border-[#0284C7]/40 text-[#0284C7] dark:text-[#38BDF8] font-bold shadow-2xs'
                      : 'hover:bg-white dark:hover:bg-[#1E2530] hover:border-slate-200 dark:hover:border-[#262F3D] border-transparent text-slate-700 dark:text-slate-300 font-medium'
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="text-xs truncate">{dept.name}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                      {dept.code}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isSelected
                        ? 'bg-sky-200/60 dark:bg-[#0284C7]/20 text-[#0284C7] dark:text-[#38BDF8]'
                        : 'bg-slate-200/80 dark:bg-[#222A36] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {dept.memberCount}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Pane: Department Details & Members Roster ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#1B2028]">
        {selectedDepartment ? (
          <>
            {/* Department Top Header Strip */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#262F3D] bg-slate-50/60 dark:bg-[#161B22] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedDepartment.name}
                  </h2>
                  <span className="text-[10px] font-bold bg-slate-200 dark:bg-[#222A36] text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded uppercase">
                    {selectedDepartment.code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                  {selectedDepartment.description}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-[#1B2028] border border-slate-200 dark:border-[#262F3D] px-3 py-1.5 rounded-[4px] shadow-2xs">
                  {selectedDepartment.memberCount} Total Members
                </span>
              </div>
            </div>

            {/* Department Head Card & Search Filter Strip */}
            <div className="p-4 sm:p-5 pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Department Head Badge */}
              {selectedDepartment.headEmployeeName ? (
                <div className="flex items-center gap-2.5 p-2 bg-slate-50 dark:bg-[#161B22] border border-slate-200 dark:border-[#262F3D] rounded-[6px] max-w-md">
                  <div className="h-8 w-8 rounded-full bg-[#0284C7] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {selectedDepartment.headEmployeeAvatar || 'DH'}
                  </div>
                  <div className="truncate">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Department Head
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {selectedDepartment.headEmployeeName}
                    </div>
                  </div>
                </div>
              ) : (
                <div />
              )}

              {/* Member Search Bar */}
              <div className="relative w-full sm:w-64">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search members in department…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#12151A] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262F3D] rounded focus:bg-white dark:focus:bg-[#1B2028] focus:outline-none focus:ring-1 focus:ring-[#0284C7]"
                />
              </div>
            </div>

            {/* Members Roster Grid */}
            <div className="p-4 sm:p-5 flex-1 overflow-y-auto">
              {filteredMembers.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-[#161B22] text-slate-400 flex items-center justify-center mx-auto mb-3 text-2xl">
                    👥
                  </div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    No users found
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    No department members match your search criteria.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredMembers.map((emp) => (
                    <div
                      key={emp.id}
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('ems:open:employee-drawer', {
                            detail: {
                              id: emp.id,
                              employeeNumber: emp.employeeNumber,
                              firstName: emp.firstName,
                              lastName: emp.lastName,
                              workEmail: emp.workEmail,
                              jobTitle: emp.jobTitle,
                              department: selectedDepartment.name,
                              branchName: emp.branchName,
                              avatarInitials: emp.avatarInitials,
                              avatarUrl: null,
                              status: 'ACTIVE',
                              manager: emp.managerName
                                ? {
                                    id: 'mgr-01',
                                    employeeNumber: 'EMP-009',
                                    firstName: emp.managerName.split(' ')[0] || '',
                                    lastName: emp.managerName.split(' ').slice(1).join(' ') || '',
                                    jobTitle: 'Team Lead',
                                  }
                                : null,
                              teams: [
                                { id: 'team-1', name: 'Frontend Engineering', isLead: false },
                              ],
                              projects: [
                                {
                                  id: 'proj-1',
                                  code: 'LUX-2026',
                                  name: 'Luxasia 2026',
                                  role: 'Developer',
                                  allocationPercentage: 70,
                                },
                                {
                                  id: 'proj-2',
                                  code: 'SMAR-EMS',
                                  name: 'Smarteam EMS Redesign',
                                  role: 'Support',
                                  allocationPercentage: 30,
                                },
                              ],
                            },
                          }),
                        );
                      }}
                      className="p-3.5 bg-white dark:bg-[#161B22] rounded-[6px] border border-slate-200/90 dark:border-[#262F3D] shadow-2xs hover:border-sky-300 dark:hover:border-sky-500 hover:shadow-xs transition-all flex items-start gap-3 cursor-pointer group"
                      title="Click to view detailed employee relationship & project allocation profile"
                    >
                      <div className="relative shrink-0">
                        <div className="h-10 w-10 rounded-full bg-slate-800 dark:bg-[#222A36] text-white font-bold text-xs flex items-center justify-center shadow-xs group-hover:ring-2 group-hover:ring-sky-400 transition-all">
                          {emp.avatarInitials}
                        </div>
                        {emp.isOnline && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#161B22]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-[#0284C7] dark:group-hover:text-[#38BDF8] transition-colors">
                            {emp.firstName} {emp.lastName}
                          </h4>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                            {emp.employeeNumber}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-[#0284C7] dark:text-[#38BDF8] truncate mt-0.5">
                          {emp.jobTitle}
                        </p>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5 mt-2 border-t border-slate-100 dark:border-[#262F3D] pt-2">
                          <div className="truncate">📍 {emp.branchName}</div>
                          <div className="truncate text-slate-400 dark:text-slate-500 font-mono">
                            ✉ {emp.workEmail}
                          </div>
                          {emp.managerName && (
                            <div className="truncate text-slate-500 dark:text-slate-400">
                              Lead:{' '}
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {emp.managerName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-xs text-slate-400">
            Select a department from the left pane to view members.
          </div>
        )}
      </div>
    </div>
  );
}
