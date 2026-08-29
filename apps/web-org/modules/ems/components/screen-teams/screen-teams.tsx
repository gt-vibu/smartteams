'use client';

import React, { useState } from 'react';
import { StandardDataTable, ColumnDef, Select, Button } from '@smarteam/ui';
import { CreateTeamModal, CreateTeamPayload, AVAILABLE_EMPLOYEES } from './create-team-modal';

import { useTeams, TeamData, TeamMemberData, TeamStatus } from '../../hooks/use-teams';
import { useAuth } from '../../hooks/use-auth';

export type { TeamData, TeamMemberData, TeamStatus };

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TeamStatus }) {
  const cfg = {
    ACTIVE: {
      label: 'Active',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      dot: 'bg-emerald-500',
    },
    ARCHIVED: {
      label: 'Archived',
      cls: 'bg-slate-100 text-slate-500 border-slate-200',
      dot: 'bg-slate-400',
    },
  }[status] || {
    label: status,
    cls: 'bg-slate-100 text-slate-500 border-slate-200',
    dot: 'bg-slate-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide border ${cfg.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Avatar Stack ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-sky-600',
  'bg-indigo-600',
  'bg-teal-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-emerald-600',
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
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Team Card ────────────────────────────────────────────────────────────────
function TeamCard({ team, onClick }: { team: TeamData; onClick: () => void }) {
  const activeMembers = team.members.filter((m) => !m.leftAt);

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-[#161B22] rounded-lg border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs hover:shadow-md hover:border-sky-300 dark:hover:border-sky-700 transition-all cursor-pointer flex flex-col justify-between group"
    >
      <div>
        {/* Header: Title + Status */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#0284C7] dark:group-hover:text-sky-400 transition-colors line-clamp-1">
            {team.name}
          </h3>
          <StatusBadge status={team.status} />
        </div>

        {/* Description */}
        {team.description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3">
            {team.description}
          </p>
        )}
      </div>

      {/* Meta + Footer */}
      <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-2.5 mt-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          {/* Team Lead / Reporting Manager */}
          <span className="flex items-center gap-1.5 truncate">
            <svg
              className="h-3.5 w-3.5 text-slate-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span className="truncate font-medium text-slate-700 dark:text-slate-300">
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
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-[10px] font-semibold text-[#0284C7] dark:text-sky-400 group-hover:underline">
            View team →
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Team Table View ──────────────────────────────────────────────────────────
function TeamTable({ teams, onSelect }: { teams: TeamData[]; onSelect: (t: TeamData) => void }) {
  const columns: ColumnDef<TeamData>[] = [
    {
      id: 'name',
      header: 'Team Name',
      accessorKey: 'name',
      sortable: true,
      pinned: 'left',
      cell: (t) => (
        <div>
          <div className="font-bold text-slate-900">{t.name}</div>
          {t.description && (
            <div className="text-[11px] text-slate-400 line-clamp-1 max-w-xs">{t.description}</div>
          )}
        </div>
      ),
    },
    {
      id: 'teamLead',
      header: 'Team Lead / Manager',
      accessorKey: (t) => (t.teamLead ? `${t.teamLead.firstName} ${t.teamLead.lastName}` : ''),
      sortable: true,
      cell: (t) =>
        t.teamLead ? (
          <div>
            <div className="font-semibold text-slate-800">
              {t.teamLead.firstName} {t.teamLead.lastName}
            </div>
            <div className="text-[10px] text-slate-400">{t.teamLead.jobTitle}</div>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      filterable: true,
      filterOptions: [
        { label: 'Active', value: 'ACTIVE' },
        { label: 'Archived', value: 'ARCHIVED' },
      ],
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      id: 'branchName',
      header: 'Branch',
      accessorKey: 'branchName',
      sortable: true,
      filterable: true,
      cell: (t) => (
        <span className="text-[11px] text-slate-500 whitespace-nowrap">{t.branchName}</span>
      ),
    },
    {
      id: 'members',
      header: 'Members',
      sortable: false,
      cell: (t) => {
        const activeCount = t.members.filter((m) => !m.leftAt).length;
        return (
          <div className="flex items-center gap-1.5">
            <AvatarStack members={t.members} max={3} />
            <span className="text-[11px] text-slate-500">{activeCount}</span>
          </div>
        );
      },
    },
    {
      id: 'createdAt',
      header: 'Created Date',
      accessorKey: 'createdAt',
      sortable: true,
      cell: (t) => (
        <span className="text-[11px] text-slate-500 whitespace-nowrap">
          {formatDate(t.createdAt)}
        </span>
      ),
    },
    {
      id: 'action',
      header: 'Action',
      align: 'right',
      pinned: 'right',
      sortable: false,
      cell: () => (
        <span className="text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer">
          View
        </span>
      ),
    },
  ];

  return (
    <StandardDataTable
      data={teams}
      columns={columns}
      keyExtractor={(t) => t.id}
      searchPlaceholder="Search team name, lead, description..."
      onRowClick={onSelect}
      initialRowsPerPage={10}
    />
  );
}

// ─── Team Detail Drawer ───────────────────────────────────────────────────────
function TeamDetailDrawer({ team, onClose }: { team: TeamData; onClose: () => void }) {
  const { persona, workspaceContext } = useAuth();
  const isTeamLead =
    team.teamLeadEmployeeId === persona?.id ||
    team.teamLeadEmployeeId === persona?.user?.id ||
    (team.teamLead &&
      `${team.teamLead.firstName} ${team.teamLead.lastName}`.toLowerCase() ===
        persona?.name?.toLowerCase());
  const canManage = workspaceContext === 'ADMIN' || isTeamLead;
  const [activeMembers, setActiveMembers] = useState(team.members.filter((m) => !m.leftAt));
  const [isAdding, setIsAdding] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState('');

  const pastMembers = team.members.filter((m) => m.leftAt);

  const availableToAdd = AVAILABLE_EMPLOYEES.filter(
    (emp) =>
      !activeMembers.some(
        (m) => m.employeeId === emp.id || m.employeeNumber === emp.employeeNumber,
      ),
  );

  const handleAddMember = () => {
    if (!selectedEmpId) return;
    const emp = AVAILABLE_EMPLOYEES.find((e) => e.id === selectedEmpId);
    if (!emp) return;

    const newMember: TeamMemberData = {
      id: `tm-${Date.now()}`,
      employeeId: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      employeeNumber: emp.employeeNumber,
      jobTitle: emp.jobTitle,
      joinedAt: new Date().toISOString().split('T')[0] || '',
      leftAt: null,
      avatarInitials: `${emp.firstName[0]}${emp.lastName[0] || ''}`,
    };

    const updated = [...activeMembers, newMember];
    setActiveMembers(updated);
    setIsAdding(false);
    setSelectedEmpId('');

    // Save to storage
    const STORAGE_KEY = 'ems_teams_list';
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const nextTeams = stored.map((t: any) =>
      t.id === team.id
        ? { ...t, members: [...t.members, newMember], memberCount: t.members.length + 1 }
        : t,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTeams));
    window.dispatchEvent(new CustomEvent('ems:storage:change'));
  };

  const handleRemoveMember = (memberId: string) => {
    const updated = activeMembers.filter((m) => m.id !== memberId);
    setActiveMembers(updated);

    const STORAGE_KEY = 'ems_teams_list';
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const nextTeams = stored.map((t: any) =>
      t.id === team.id
        ? {
            ...t,
            members: t.members.filter((m: any) => m.id !== memberId),
            memberCount: t.members.length - 1,
          }
        : t,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTeams));
    window.dispatchEvent(new CustomEvent('ems:storage:change'));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-bold text-slate-900">{team.name}</h2>
                <StatusBadge status={team.status} />
              </div>
              <p className="text-xs text-slate-500">{team.branchName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Description */}
            {team.description && (
              <div className="bg-[#EEF2F6]/60 border border-slate-200/80 rounded-[6px] p-3.5">
                <p className="text-xs text-slate-700 leading-relaxed">{team.description}</p>
              </div>
            )}

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-[6px] p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">
                  Team Lead / Manager
                </p>
                <p className="text-xs font-semibold text-slate-800">
                  {team.teamLead ? `${team.teamLead.firstName} ${team.teamLead.lastName}` : '—'}
                </p>
                {team.teamLead && (
                  <p className="text-[10px] text-slate-500">{team.teamLead.jobTitle}</p>
                )}
              </div>
              <div className="bg-slate-50 rounded-[6px] p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">
                  Created Date
                </p>
                <p className="text-xs font-semibold text-slate-800">{formatDate(team.createdAt)}</p>
              </div>
            </div>

            {/* Active Members */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide !m-0">
                  Active Members ({activeMembers.length})
                </h3>
                {canManage && (
                  <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="text-[11px] font-bold text-[#0284C7] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>{isAdding ? '✕ Cancel' : '+ Add Member'}</span>
                  </button>
                )}
              </div>

              {/* Add Member Form */}
              {isAdding && (
                <div className="p-3 bg-sky-50/50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg mb-3 space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Select Employee to Assign
                  </label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Select
                        value={selectedEmpId}
                        onChange={(e) => setSelectedEmpId(e.target.value)}
                        placeholder="Choose an employee..."
                      >
                        <option value="">Choose an employee...</option>
                        {availableToAdd.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.firstName} {e.lastName} ({e.jobTitle} · {e.employeeNumber})
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button size="sm" onClick={handleAddMember} disabled={!selectedEmpId}>
                      Assign
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {activeMembers.map((m, i) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-2.5 bg-white rounded-[6px] border border-slate-200/90 shadow-xs group"
                  >
                    <div
                      className={`h-8 w-8 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-white text-xs font-bold flex items-center justify-center shrink-0`}
                    >
                      {m.avatarInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-slate-900">
                          {m.firstName} {m.lastName}
                        </p>
                        {team.teamLeadEmployeeId === m.employeeId && (
                          <span className="text-[9px] bg-[#0284C7] text-white px-1.5 py-0.2 rounded font-bold uppercase">
                            Lead
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {m.jobTitle} · {m.employeeNumber}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400">Joined</p>
                        <p className="text-[10px] text-slate-700 font-semibold">
                          {formatDate(m.joinedAt)}
                        </p>
                      </div>
                      {canManage && team.teamLeadEmployeeId !== m.employeeId && (
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          title="Remove from team"
                        >
                          ✕
                        </button>
                      )}
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
                        <p className="text-xs font-semibold text-slate-700">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {m.jobTitle} · Left {formatDate(m.leftAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-[#262F3D] bg-slate-50 dark:bg-[#161B22] flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold rounded border border-transparent dark:border-slate-700 transition-colors cursor-pointer"
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
  const { myAssignedTeams, isAssignedToTeam, addTeam } = useTeams();
  const { workspaceContext } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('All Teams');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<TeamData | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const tabs = ['All Teams', 'Active', 'Archived'];

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

    addTeam(newTeam);
    setActiveTab('All Teams');
    setSelectedTeam(newTeam);
    setToastMessage(
      `Team "${newTeam.name}" created successfully with ${newTeam.teamLead ? `${newTeam.teamLead.firstName} ${newTeam.teamLead.lastName}` : 'No lead'} as Lead!`,
    );

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
      <div className="sticky top-0 z-20 bg-[#F0F4F8]">
        <div className="bg-white/95 backdrop-blur-md pt-3 pb-3 border-b border-slate-200/90 px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] w-full">
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
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
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
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                  />
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
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
              </button>
            </div>

            {/* Primary CTA: + New Team (Strictly for ADMIN context) */}
            {workspaceContext === 'ADMIN' && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-[4px] shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden xs:inline">New Team</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Scrollable Content Area */}
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 pt-3.5">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-[6px] border border-slate-200/90 p-10 text-center shadow-xs">
            <svg
              className="h-8 w-8 text-slate-300 mx-auto mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <div className="text-sm font-bold text-slate-700">
              {!isAssignedToTeam ? 'No Assigned Team' : 'No teams found'}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {!isAssignedToTeam
                ? 'You are not assigned to any team yet. Contact your reporting manager to be assigned to a squad.'
                : 'Try switching tabs or clearing search filters.'}
            </p>
            {workspaceContext === 'ADMIN' && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-[4px] shadow-xs cursor-pointer"
              >
                + Create Team
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((team) => (
              <TeamCard key={team.id} team={team} onClick={() => setSelectedTeam(team)} />
            ))}
          </div>
        ) : (
          <TeamTable teams={filtered} onSelect={(t) => setSelectedTeam(t)} />
        )}
      </div>

      {/* Detail Slide-in Drawer */}
      {selectedTeam && (
        <TeamDetailDrawer team={selectedTeam} onClose={() => setSelectedTeam(null)} />
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
