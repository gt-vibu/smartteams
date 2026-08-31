'use client';

import React, { useRef, useState } from 'react';
import type { ColumnDef } from '@smarteam/ui';
import { StandardDataTable, Select, Button, useFocusTrap } from '@smarteam/ui';
import { AVAILABLE_EMPLOYEES } from './create-team-modal';
import type { TeamData, TeamMemberData, TeamStatus } from '../../hooks/use-teams';
import { useAuth } from '../../hooks/use-auth';
import { emsStorageAdapter } from '../../storage/storage.adapter';

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
  }[status];

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
export function TeamCard({ team, onClick }: { team: TeamData; onClick: () => void }) {
  const activeMembers = team.members.filter((m) => !m.leftAt);

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-card rounded-lg border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs hover:shadow-md hover:border-sky-300 dark:hover:border-sky-700 transition-all cursor-pointer flex flex-col justify-between group"
    >
      <div>
        {/* Header: Title + Status */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary dark:group-hover:text-sky-400 transition-colors line-clamp-1">
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
          <span className="text-[10px] font-semibold text-primary dark:text-sky-400 group-hover:underline">
            View team →
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Team Table View ──────────────────────────────────────────────────────────
export function TeamTable({
  teams,
  onSelect,
}: {
  teams: TeamData[];
  onSelect: (t: TeamData) => void;
}) {
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
        <span className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline cursor-pointer">
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
export function TeamDetailDrawer({ team, onClose }: { team: TeamData; onClose: () => void }) {
  const { persona, workspaceContext } = useAuth();
  const isTeamLead =
    team.teamLeadEmployeeId === persona.id ||
    team.teamLeadEmployeeId === persona.user.id ||
    (team.teamLead &&
      `${team.teamLead.firstName} ${team.teamLead.lastName}`.toLowerCase() ===
        persona.name.toLowerCase());
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
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef, onClose);

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
    const stored = emsStorageAdapter.getItem<TeamData[]>(STORAGE_KEY, []);
    const nextTeams = stored.map((t) =>
      t.id === team.id
        ? { ...t, members: [...t.members, newMember], memberCount: t.members.length + 1 }
        : t,
    );
    emsStorageAdapter.setItem(STORAGE_KEY, nextTeams);
    window.dispatchEvent(new CustomEvent('ems:storage:change'));
  };

  const handleRemoveMember = (memberId: string) => {
    const updated = activeMembers.filter((m) => m.id !== memberId);
    setActiveMembers(updated);

    const STORAGE_KEY = 'ems_teams_list';
    const stored = emsStorageAdapter.getItem<TeamData[]>(STORAGE_KEY, []);
    const nextTeams = stored.map((t) =>
      t.id === team.id
        ? {
            ...t,
            members: t.members.filter((m) => m.id !== memberId),
            memberCount: t.members.length - 1,
          }
        : t,
    );
    emsStorageAdapter.setItem(STORAGE_KEY, nextTeams);
    window.dispatchEvent(new CustomEvent('ems:storage:change'));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="team-detail-title"
          tabIndex={-1}
          className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 id="team-detail-title" className="text-sm font-bold text-slate-900">
                  {team.name}
                </h2>
                <StatusBadge status={team.status} />
              </div>
              <p className="text-xs text-slate-500">{team.branchName}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close team details"
              onClick={onClose}
              className="h-8 w-8 text-slate-400 hover:text-slate-700"
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
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Description */}
            {team.description && (
              <div className="bg-muted/60 border border-slate-200/80 rounded-[6px] p-3.5">
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
                  <Button
                    onClick={() => setIsAdding(!isAdding)}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>{isAdding ? '✕ Cancel' : '+ Add Member'}</span>
                  </Button>
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
                          <span className="text-[9px] bg-slate-900 text-white px-1.5 py-0.2 rounded font-bold uppercase">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(m.employeeId)}
                          className="h-6 w-6 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Remove from team"
                        >
                          ✕
                        </Button>
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
          <div className="p-4 border-t border-slate-200 dark:border-border bg-slate-50 dark:bg-card flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Screen Component ────────────────────────────────────────────────────
