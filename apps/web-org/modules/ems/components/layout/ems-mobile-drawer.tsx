'use client';

import React from 'react';
import { useAuth } from '../../hooks/use-auth';

interface EmsMobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeSpace: string;
  onSelectSpace: (space: string) => void;
  activeModule: string;
  onSelectModule: (module: string) => void;
}

export function EmsMobileDrawer({
  isOpen,
  onClose,
  activeSpace,
  onSelectSpace,
  activeModule,
  onSelectModule,
}: EmsMobileDrawerProps) {
  const {
    visibleSpaces,
    canAccessModule,
    persona,
    workspaceContext,
    switchWorkspace,
    canSwitchWorkspace,
  } = useAuth();

  if (!isOpen) return null;

  const isOrgSpace = activeSpace === 'Organization';

  const employeeItems = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'time-off', label: 'Time Off', icon: '🌴' },
    { id: 'timesheet', label: 'Timesheet', icon: '⏱' },
    { id: 'attendance', label: 'Attendance', icon: '📅' },
    { id: 'projects', label: 'Projects', icon: '📁' },
    { id: 'payroll', label: 'Payroll & Payslips', icon: '💰' },
    { id: 'approvals', label: 'Approvals', icon: '✓' },
    { id: 'files', label: 'Documents & Files', icon: '📂' },
  ];

  const adminItems = [
    { id: 'home', label: 'Overview', icon: '🏢' },
    { id: 'onboarding', label: 'Staff Onboarding', icon: '👥' },
    { id: 'time-off', label: 'Leave Management', icon: '🌴' },
    { id: 'attendance', label: 'Workforce Attendance', icon: '📅' },
    { id: 'timesheet', label: 'Timesheet Tracker', icon: '⏱' },
    { id: 'teams', label: 'Teams & Squads', icon: '👥' },
    { id: 'projects', label: 'Projects & Allocations', icon: '📁' },
    { id: 'payroll', label: 'Payroll & Compensation', icon: '💰' },
    { id: 'approvals', label: 'Managerial Approvals', icon: '🛡' },
    { id: 'files', label: 'Enterprise Document Vault', icon: '📂' },
  ];

  const candidateItems = isOrgSpace ? adminItems : employeeItems;
  const visibleItems = candidateItems.filter((item) =>
    isOrgSpace ? true : canAccessModule(item.id),
  );

  const handleSelect = (modId: string) => {
    onSelectModule(modId);
    onClose();
  };

  const handleSpaceChange = (spaceId: string) => {
    onSelectSpace(spaceId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden md:hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-over Drawer Panel */}
      <div className="fixed inset-y-0 left-0 max-w-[280px] w-full bg-[#06152D] text-white shadow-2xl flex flex-col z-10 border-r border-[#0F2444] animate-in slide-in-from-left duration-250">
        {/* Header */}
        <div className="p-4 border-b border-[#0F2444] flex items-center justify-between bg-[#040E20]">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-[6px] bg-[#0284C7] flex items-center justify-center text-white font-bold text-xs shadow-xs">
              S
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">Smarteam EMS</div>
              <div className="text-[10px] text-slate-400 font-medium">Enterprise Workforce</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
            title="Close menu"
          >
            ✕
          </button>
        </div>

        {/* User Identity Chip */}
        <div className="p-3 bg-[#0B1D38] border-b border-[#0F2444] flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#0284C7] to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
            {persona.avatarInitials || persona.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">{persona.name}</div>
            <div className="text-[10px] text-sky-300 truncate">{persona.jobTitle}</div>
          </div>
        </div>

        {/* Workspace Switcher in Mobile Drawer */}
        {canSwitchWorkspace && (
          <div className="p-3 border-b border-[#0F2444] space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Workspace Context
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => {
                  switchWorkspace('EMPLOYEE');
                  onSelectSpace('My Space');
                  onClose();
                }}
                className={`px-2 py-1.5 text-xs font-semibold rounded text-center transition-colors ${
                  workspaceContext === 'EMPLOYEE'
                    ? 'bg-[#0284C7] text-white font-bold'
                    : 'bg-[#0E2038] text-slate-300 hover:text-white'
                }`}
              >
                👤 Employee
              </button>
              <button
                onClick={() => {
                  switchWorkspace('ADMIN');
                  onSelectSpace('Organization');
                  onClose();
                }}
                className={`px-2 py-1.5 text-xs font-semibold rounded text-center transition-colors ${
                  workspaceContext === 'ADMIN'
                    ? 'bg-[#0284C7] text-white font-bold'
                    : 'bg-[#0E2038] text-slate-300 hover:text-white'
                }`}
              >
                🏢 Admin
              </button>
            </div>
          </div>
        )}

        {/* Spaces Switcher */}
        <div className="p-3 border-b border-[#0F2444] space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
            Navigation Space
          </span>
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {visibleSpaces.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSpaceChange(s.id)}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                  activeSpace === s.id
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                    : 'bg-[#0E2038] text-slate-300 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modules List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1 no-scrollbar">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider px-2 block mb-1">
            {isOrgSpace ? 'Admin Modules' : 'Workspace Modules'}
          </span>
          {visibleItems.map((item) => {
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#0284C7] text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-[#112340] hover:text-white'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#0F2444] text-[10px] text-center text-slate-400 bg-[#040E20]">
          Smarteam EMS v2.4 · Enterprise Edition
        </div>
      </div>
    </div>
  );
}
