'use client';

import React, { useState } from 'react';
import teamsFixture from '../../data/fixtures/teams.json';
import { CreateTeamModal, CreateTeamPayload, AVAILABLE_EMPLOYEES } from './create-team-modal';
import { useEmployee } from '../../hooks/use-employee';

// ─── Types (from backend Team + TeamMember schema) ───────────────────────────
export type TeamStatus = 'ACTIVE' | 'ARCHIVED';

export interface TeamMemberData {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  jobTitle: string;
  joinedAt: string;
  leftAt: string | null;
  avatarInitials: string;
}

export interface TeamData {
  id: string;
  name: string;
  description: string | null;
  status: TeamStatus;
  teamLeadEmployeeId: string | null;
  teamLead: { firstName: string; lastName: string; employeeNumber: string; jobTitle: string } | null;
  branchName: string;
  memberCount: number;
  createdAt: string;
  members: TeamMemberData[];
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TeamStatus }) {
  const cfg = {
    ACTIVE:   { label: 'Active',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    ARCHIVED: { label: 'Archived', cls: 'bg-slate-100 text-slate-500 border-slate-200',    dot: 'bg-slate-400' },
  }[status] || { label: status, cls: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold tracking-wide border ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Avatar Stack ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-sky-600', 'bg-indigo-600', 'bg-teal-600', 'bg-violet-600',
  'bg-amber-600', 'bg-rose-600', 'bg-cyan-600', 'bg-emerald-600',
];

function AvatarStack({ members, max = 5 }: { members: TeamMemberData[]; max?: number }) {
  const active = members.filter((m) => !m.leftAt);
  const shown = active.slice(0, max);
  const rest = active.length - shown.length;

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((m, i) => (
        <div
          key={m.id}
          className={`h-5 w-5 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} border-2 border-white text-white text-[8px] font-bold flex items-center justify-center`}
          title={`${m.firstName} ${m.lastName} (${m.jobTitle})`}
        >
          {m.avatarInitials}
        </div>
      ))}
      {rest > 0 && (
        <div className="h-5 w-5 rounded-full bg-slate-200 border-2 border-white text-slate-600 text-[8px] font-bold flex items-center justify-center">
          +{rest}
        </div>
      )}
    </div>
  );
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Team Card ────────────────────────────────────────────────────────────────
function TeamCard({ team, onClick }: { team: TeamData; onClick: () => void }) {
  const activeMembers = team.members.filter((m) => !m.leftAt);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-[6px] border border-slate-200/90 p-4 shadow-xs hover:shadow-md hover:border-sky-300 transition-all cursor-pointer flex flex-col justify-between group"
    >
      <div>
        {/* Header: Title + Status */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-bold text-slate-800 group-hover:text-[#0284C7] transition-colors line-clamp-1">
            {team.name}
          </h3>
          <StatusBadge status={team.status} />
        </div>

        {/* Description */}
        {team.description && (
          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
            {team.description}
          </p>
        )}
      </div>

      {/* Meta + Footer */}
      <div className="space-y-2.5 border-t border-slate-100 pt-2.5 mt-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          {/* Team Lead / Reporting Manager */}
          <span className="flex items-center gap-1.5 truncate">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="truncate font-medium text-slate-700">
              Lead: {team.teamLead ? `${team.teamLead.firstName} ${team.teamLead.lastName}` : '—'}
            </span>
          </span>
          <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
            {team.branchName}
          </span>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1.5">
            <AvatarStack members={team.members} />
            <span className="text-[11px] text-slate-500 font-medium">
              {activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-[10px] font-semibold text-[#0284C7] group-hover:underline">
            View team →
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Team Table View ──────────────────────────────────────────────────────────
function TeamTable({ teams, onSelect }: { teams: TeamData[]; onSelect: (t: TeamData) => void }) {
  return (
    <div className="bg-white rounded-[6px] border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <th className="py-2.5 px-4">Team Name</th>
              <th className="py-2.5 px-4">Team Lead / Manager</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Branch</th>
              <th className="py-2.5 px-4">Members</th>
              <th className="py-2.5 px-4">Created Date</th>
              <th className="py-2.5 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
            {teams.map((t) => {
              const activeCount = t.members.filter((m) => !m.leftAt).length;
              return (
                <tr
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className="hover:bg-sky-50/40 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{t.name}</div>
                    {t.description && (
                      <div className="text-[11px] text-slate-400 line-clamp-1 max-w-xs">
                        {t.description}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {t.teamLead ? (
                      <div>
                        <div className="font-semibold text-slate-800">{t.teamLead.firstName} {t.teamLead.lastName}</div>
                        <div className="text-[10px] text-slate-400">{t.teamLead.jobTitle}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="py-3 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                    {t.branchName}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <AvatarStack members={t.members} max={3} />
                      <span className="text-[11px] text-slate-500">{activeCount}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                    {formatDate(t.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-xs font-semibold text-[#0284C7] hover:underline">
                      View
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Team Detail Drawer ───────────────────────────────────────────────────────
function TeamDetailDrawer({ team, onClose }: { team: TeamData; onClose: () => void }) {
  const activeMembers = team.members.filter((m) => !m.leftAt);
  const pastMembers = team.members.filter((m) => m.leftAt);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" />
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-bold text-slate-900">
                  {team.name}
                </h2>
                <StatusBadge status={team.status} />
              </div>
              <p className="text-xs text-slate-500">{team.branchName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Description */}
            {team.description && (
              <div className="bg-[#EEF2F6]/60 border border-slate-200/80 rounded-[6px] p-3.5">
                <p className="text-xs text-slate-700 leading-relaxed">
                  {team.description}
                </p>
              </div>
            )}

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-[6px] p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Team Lead / Manager</p>
                <p className="text-xs font-semibold text-slate-800">
                  {team.teamLead ? `${team.teamLead.firstName} ${team.teamLead.lastName}` : '—'}
                </p>
                {team.teamLead && <p className="text-[10px] text-slate-500">{team.teamLead.jobTitle}</p>}
              </div>
              <div className="bg-slate-50 rounded-[6px] p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Created Date</p>
                <p className="text-xs font-semibold text-slate-800">{formatDate(team.createdAt)}</p>
              </div>
            </div>

            {/* Active Members */}
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2.5">
                Active Members ({activeMembers.length})
              </h3>
              <div className="space-y-2">
                {activeMembers.map((m, i) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-2.5 bg-white rounded-[6px] border border-slate-200/90 shadow-xs"
                  >
                    <div className={`h-8 w-8 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                      {m.avatarInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-slate-900">{m.firstName} {m.lastName}</p>
                        {team.teamLeadEmployeeId === m.employeeId && (
                          <span className="text-[9px] bg-[#0284C7] text-white px-1.5 py-0.2 rounded font-bold uppercase">
                            Lead
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">{m.jobTitle} · {m.employeeNumber}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-400">Joined</p>
                      <p className="text-[10px] text-slate-700 font-semibold">{formatDate(m.joinedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Past Members */}
            {pastMembers.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                  Past Members ({pastMembers.length})
                </h3>
                <div className="space-y-2">
                  {pastMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 p-2 bg-slate-50 rounded-[6px] border border-slate-100 opacity-70"
                    >
                      <div className="h-7 w-7 rounded-full bg-slate-300 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                        {m.avatarInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700">{m.firstName} {m.lastName}</p>
                        <p className="text-[10px] text-slate-400">{m.jobTitle} · Left {formatDate(m.leftAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Screen Component ────────────────────────────────────────────────────
export function ScreenTeams() {
  const { employee } = useEmployee();
  const [teams, setTeams] = useState<TeamData[]>(teamsFixture.teams as TeamData[]);
  const [activeTab, setActiveTab] = useState<string>('All Teams');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<TeamData | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const tabs = ['All Teams', 'Active', 'Archived'];

  // Filter: ONLY show teams the current employee is assigned to (member or lead)
  const myAssignedTeams = teams.filter((t) => {
    const isMember = t.members.some(
      (m) => (m.employeeId === employee.id || m.employeeNumber === employee.employeeNumber) && !m.leftAt
    );
    const isLead = t.teamLeadEmployeeId === employee.id;
    return isMember || isLead;
  });

  const filtered = myAssignedTeams.filter((t) => {
    let matchTab = true;
    if (activeTab === 'Active') matchTab = t.status === 'ACTIVE';
    else if (activeTab === 'Archived') matchTab = t.status === 'ARCHIVED';

    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.branchName.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.teamLead && `${t.teamLead.firstName} ${t.teamLead.lastName}`.toLowerCase().includes(q));

    return matchTab && matchSearch;
  });

  const handleCreateTeam = (payload: CreateTeamPayload) => {
    const leadEmp = AVAILABLE_EMPLOYEES.find((e) => e.id === payload.teamLeadEmployeeId);
    const today = new Date().toISOString().slice(0, 10);

    const membersData: TeamMemberData[] = payload.memberEmployeeIds.map((empId, idx) => {
      const emp = AVAILABLE_EMPLOYEES.find((e) => e.id === empId);
      return {
        id: `tm-new-${Date.now()}-${idx}`,
        employeeId: empId,
        firstName: emp?.firstName || 'Employee',
        lastName: emp?.lastName || '',
        employeeNumber: emp?.employeeNumber || `EMP-${empId}`,
        jobTitle: emp?.jobTitle || 'Team Member',
        joinedAt: today,
        leftAt: null,
        avatarInitials: emp?.avatarInitials || 'EM',
      };
    });

    const newTeam: TeamData = {
      id: `team-${Date.now()}`,
      name: payload.name,
      description: payload.description || null,
      status: payload.status,
      teamLeadEmployeeId: payload.teamLeadEmployeeId,
      teamLead: leadEmp
        ? {
            firstName: leadEmp.firstName,
            lastName: leadEmp.lastName,
            employeeNumber: leadEmp.employeeNumber,
            jobTitle: leadEmp.jobTitle,
          }
        : null,
      branchName: payload.branchName,
      memberCount: membersData.length,
      createdAt: today,
      members: membersData,
    };

    setTeams([newTeam, ...teams]);
    setActiveTab('All Teams');
    setSelectedTeam(newTeam);
    setToastMessage(`Team "${newTeam.name}" created successfully with ${newTeam.teamLead ? `${newTeam.teamLead.firstName} ${newTeam.teamLead.lastName}` : 'No lead'} as Lead!`);

    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <div className="w-full flex flex-col relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-[6px] shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Sub-Tabs & Actions Toolbar — Sticky within scroll container */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 bg-[#EEF2F6]">
        <div className="bg-[#EEF2F6]/95 backdrop-blur-md pt-3 pb-3 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] w-full">
          {/* Sub-Tabs */}
          <div className="flex items-center space-x-4 sm:space-x-6 overflow-x-auto no-scrollbar py-0.5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-xs font-semibold pb-1 transition-colors relative whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'text-[#0284C7] border-b-2 border-[#0284C7]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Right: Search, View Mode Switcher, + New Team Button */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Search Input */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams…"
                className="pl-8 pr-3 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#0284C7] focus:border-[#0284C7] w-36 xs:w-44 sm:w-52"
              />
            </div>

            {/* Grid / Table View Switcher */}
            <div className="flex items-center bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-sky-50 text-[#0284C7] font-bold'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
                title="Grid View"
                aria-label="Grid View"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 transition-colors border-l border-slate-200 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-sky-50 text-[#0284C7] font-bold'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
                title="Table View"
                aria-label="Table View"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Primary CTA: + New Team */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-[4px] shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden xs:inline">New Team</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Content Area */}
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 pt-3.5">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-[6px] border border-slate-200/90 p-10 text-center shadow-xs">
            <svg className="h-8 w-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="text-sm font-bold text-slate-700">No teams found</div>
            <p className="text-xs text-slate-500 mt-1">Try switching tabs, searching for another keyword, or create a new team.</p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-[4px] shadow-xs cursor-pointer"
            >
              + Create Team
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                onClick={() => setSelectedTeam(team)}
              />
            ))}
          </div>
        ) : (
          <TeamTable
            teams={filtered}
            onSelect={(t) => setSelectedTeam(t)}
          />
        )}
      </div>

      {/* Detail Slide-in Drawer */}
      {selectedTeam && (
        <TeamDetailDrawer
          team={selectedTeam}
          onClose={() => setSelectedTeam(null)}
        />
      )}

      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateTeam}
      />
    </div>
  );
}
