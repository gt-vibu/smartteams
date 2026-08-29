'use client';

import React, { useState } from 'react';
import { StandardDataTable, ColumnDef } from '@smarteam/ui';
import projectsFixture from '../../data/fixtures/projects.json';

import { CreateProjectModal, CreateProjectPayload, ProjectStatus } from './create-project-modal';
import { AssignProjectMemberModal } from './assign-project-member-modal';
import { AVAILABLE_EMPLOYEES } from '../screen-teams/create-team-modal';
import { useEmployee } from '../../hooks/use-employee';
import { useAuth } from '../../hooks/use-auth';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface ProjectMemberData {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  projectRole: string | null;
  allocationPercentage: string | null;
  startsOn: string;
  endsOn: string | null;
  avatarInitials: string;
}

export interface ProjectData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  branchName: string;
  createdAt: string;
  members: ProjectMemberData[];
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ProjectStatus, { label: string; badgeCls: string; dotCls: string }> = {
  PLANNED: {
    label: 'Planned',
    badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',
    dotCls: 'bg-amber-500',
  },
  ACTIVE: {
    label: 'Active',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotCls: 'bg-emerald-500',
  },
  COMPLETED: {
    label: 'Completed',
    badgeCls: 'bg-sky-50 text-sky-700 border-sky-200',
    dotCls: 'bg-sky-500',
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeCls: 'bg-rose-50 text-rose-700 border-rose-200',
    dotCls: 'bg-rose-500',
  },
  ARCHIVED: {
    label: 'Archived',
    badgeCls: 'bg-slate-100 text-slate-500 border-slate-200',
    dotCls: 'bg-slate-400',
  },
};

function StatusBadge({ status }: { status: ProjectStatus }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    badgeCls: 'bg-slate-100 text-slate-600 border-slate-200',
    dotCls: 'bg-slate-400',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-semibold tracking-wide border ${cfg.badgeCls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotCls}`} />
      {cfg.label}
    </span>
  );
}

// ─── Avatar Row ───────────────────────────────────────────────────────────────
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

function AvatarRow({ members, max = 4 }: { members: ProjectMemberData[]; max?: number }) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((m, i) => (
        <div
          key={m.id}
          className={`h-5 w-5 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} border-2 border-white text-white text-[8px] font-bold flex items-center justify-center`}
          title={`${m.firstName} ${m.lastName}${m.projectRole ? ` (${m.projectRole})` : ''}`}
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

// ─── Grid View Card ───────────────────────────────────────────────────────────
function ProjectCard({ project, onClick }: { project: ProjectData; onClick: () => void }) {
  const activeMembers = project.members.filter((m) => !m.endsOn);

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-[#161B22] rounded-lg border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs hover:shadow-md hover:border-sky-300 dark:hover:border-sky-700 transition-all cursor-pointer flex flex-col justify-between group"
    >
      <div>
        {/* Header: Code + Status */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-100/90 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded px-1.5 py-0.5">
            {project.code}
          </span>
          <StatusBadge status={project.status} />
        </div>

        {/* Title */}
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#0284C7] dark:group-hover:text-sky-400 transition-colors line-clamp-1 mb-1">
          {project.name}
        </h3>

        {/* Description */}
        {project.description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3">
            {project.description}
          </p>
        )}
      </div>

      {/* Meta + Footer */}
      <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-2.5 mt-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
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
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>
              {formatDate(project.startDate)}
              {project.endDate ? ` – ${formatDate(project.endDate)}` : ' – Ongoing'}
            </span>
          </span>
          <span className="text-[10px] text-slate-400 font-medium truncate max-w-[110px]">
            {project.branchName}
          </span>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1.5">
            <AvatarRow members={project.members} />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {activeMembers.length} active
            </span>
          </div>
          <span className="text-[10px] font-semibold text-[#0284C7] dark:text-sky-400 group-hover:underline">
            View details →
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────
function ProjectTable({
  projects,
  onSelect,
}: {
  projects: ProjectData[];
  onSelect: (p: ProjectData) => void;
}) {
  const columns: ColumnDef<ProjectData>[] = [
    {
      id: 'code',
      header: 'Code',
      accessorKey: 'code',
      sortable: true,
      pinned: 'left',
      cell: (p) => <span className="font-mono font-bold text-slate-700 text-[11px]">{p.code}</span>,
    },
    {
      id: 'name',
      header: 'Project Name',
      accessorKey: 'name',
      sortable: true,
      cell: (p) => (
        <div>
          <div className="font-bold text-slate-900">{p.name}</div>
          {p.description && (
            <div className="text-[11px] text-slate-400 line-clamp-1 max-w-xs">{p.description}</div>
          )}
        </div>
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
        { label: 'Completed', value: 'COMPLETED' },
        { label: 'On Hold', value: 'ON_HOLD' },
        { label: 'Planning', value: 'PLANNING' },
      ],
      cell: (p) => <StatusBadge status={p.status} />,
    },
    {
      id: 'timeline',
      header: 'Timeline',
      accessorKey: 'startDate',
      sortable: true,
      cell: (p) => (
        <span className="text-[11px] text-slate-500 whitespace-nowrap">
          {formatDate(p.startDate)} {p.endDate ? `– ${formatDate(p.endDate)}` : '– Ongoing'}
        </span>
      ),
    },
    {
      id: 'branchName',
      header: 'Branch',
      accessorKey: 'branchName',
      sortable: true,
      filterable: true,
      cell: (p) => (
        <span className="text-[11px] text-slate-500 whitespace-nowrap">{p.branchName}</span>
      ),
    },
    {
      id: 'members',
      header: 'Members',
      sortable: false,
      cell: (p) => {
        const activeCount = p.members.filter((m) => !m.endsOn).length;
        return (
          <div className="flex items-center gap-1.5">
            <AvatarRow members={p.members} max={3} />
            <span className="text-[11px] text-slate-500">{activeCount}</span>
          </div>
        );
      },
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
      data={projects}
      columns={columns}
      keyExtractor={(p) => p.id}
      searchPlaceholder="Search project code, name, description..."
      onRowClick={onSelect}
      initialRowsPerPage={10}
    />
  );
}

// ─── Staffing & Allocation Matrix View ────────────────────────────────────────
function StaffingMatrixView({
  projects,
  onOpenAssign,
  canManage = false,
}: {
  projects: ProjectData[];
  onOpenAssign: () => void;
  canManage?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Organizational resource allocation across all active initiatives and engineering
          deliverables.
        </p>
        {canManage && (
          <button
            onClick={onOpenAssign}
            className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold rounded-[5px] shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Assign Team Member</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/75 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              <th className="py-2.5 px-4">Employee</th>
              <th className="py-2.5 px-3">Designation</th>
              <th className="py-2.5 px-3">Allocated Projects</th>
              <th className="py-2.5 px-3">Total Utilization</th>
              {canManage && <th className="py-2.5 px-3 text-right">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {AVAILABLE_EMPLOYEES.map((emp) => {
              const empProjects = projects.flatMap((p) =>
                p.members
                  .filter(
                    (m) =>
                      (m.employeeId === emp.id || m.employeeNumber === emp.employeeNumber) &&
                      !m.endsOn,
                  )
                  .map((m) => ({
                    projectCode: p.code,
                    projectName: p.name,
                    role: m.projectRole || 'Member',
                    percentage: parseInt(m.allocationPercentage || '0', 10) || 40,
                  })),
              );

              const totalPercentage = empProjects.reduce((acc, p) => acc + p.percentage, 0);

              return (
                <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {emp.firstName} {emp.lastName}
                    <div className="text-[10px] text-slate-400 font-mono">{emp.employeeNumber}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-600">{emp.jobTitle}</td>
                  <td className="py-3 px-3">
                    {empProjects.length === 0 ? (
                      <span className="text-slate-400 italic text-[11px]">Bench / Unassigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {empProjects.map((ep, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-medium"
                          >
                            <span className="font-bold font-mono">{ep.projectCode}</span>
                            <span className="text-slate-500">({ep.percentage}%)</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="w-28 space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span
                          className={
                            totalPercentage > 100 ? 'text-rose-600 font-bold' : 'text-slate-600'
                          }
                        >
                          {totalPercentage}%
                        </span>
                        <span className="text-slate-400">
                          {totalPercentage === 100
                            ? '100% Full'
                            : totalPercentage > 100
                              ? 'Overallocated'
                              : 'Available'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            totalPercentage > 100
                              ? 'bg-rose-500'
                              : totalPercentage === 100
                                ? 'bg-emerald-500'
                                : 'bg-sky-500'
                          }`}
                          style={{ width: `${Math.min(totalPercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  {canManage && (
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={onOpenAssign}
                        className="px-2 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 cursor-pointer"
                      >
                        + Assign
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Project Detail Drawer ────────────────────────────────────────────────────
function ProjectDetailDrawer({
  project,
  onClose,
  onOpenAssign,
}: {
  project: ProjectData;
  onClose: () => void;
  onOpenAssign: () => void;
}) {
  const { workspaceContext } = useAuth();
  const canManage = workspaceContext === 'ADMIN';
  const activeMembers = project.members.filter((m) => !m.endsOn);
  const pastMembers = project.members.filter((m) => m.endsOn);

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
                <span className="text-[10px] font-mono font-bold text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                  {project.code}
                </span>
                <StatusBadge status={project.status} />
              </div>
              <h2 className="text-sm font-bold text-slate-900 mt-1">{project.name}</h2>
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
            {project.description && (
              <div className="bg-[#EEF2F6]/60 border border-slate-200/80 rounded-[6px] p-3.5">
                <p className="text-xs text-slate-700 leading-relaxed">{project.description}</p>
              </div>
            )}

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-[6px] p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">
                  Start Date
                </p>
                <p className="text-xs font-semibold text-slate-800">
                  {formatDate(project.startDate)}
                </p>
              </div>
              <div className="bg-slate-50 rounded-[6px] p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">
                  End Date
                </p>
                <p className="text-xs font-semibold text-slate-800">
                  {project.endDate ? formatDate(project.endDate) : 'Ongoing'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-[6px] p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">
                  Branch
                </p>
                <p className="text-xs font-semibold text-slate-800">{project.branchName}</p>
              </div>
              <div className="bg-slate-50 rounded-[6px] p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">
                  Total Assigned
                </p>
                <p className="text-xs font-semibold text-slate-800">
                  {activeMembers.length} Members
                </p>
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
                    onClick={onOpenAssign}
                    className="text-[11px] font-bold text-[#0284C7] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>+ Assign Member</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {activeMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 rounded-[6px] border border-slate-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {m.avatarInitials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {m.projectRole || 'Team Member'} · {m.allocationPercentage || '100%'}{' '}
                          allocation
                        </p>
                      </div>
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
                          {m.projectRole || 'Member'} · Ended {formatDate(m.endsOn)}
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
export function ScreenProjects() {
  const { employee } = useEmployee();
  const { workspaceContext } = useAuth();
  const isAdmin = workspaceContext === 'ADMIN';

  const [projects, setProjects] = useState<ProjectData[]>(
    projectsFixture.projects as ProjectData[],
  );
  const [activeTab, setActiveTab] = useState<string>('All Projects');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const tabs = isAdmin
    ? ['All Projects', 'Staffing Matrix', 'Active', 'Planned', 'Completed']
    : ['All Projects', 'Active', 'Planned', 'Completed'];

  // If Admin context, show ALL projects. If Employee context, filter by assigned.
  const displayPool = isAdmin
    ? projects
    : projects.filter((p) =>
        p.members.some(
          (m) =>
            (m.employeeId === employee.id || m.employeeNumber === employee.employeeNumber) &&
            !m.endsOn,
        ),
      );

  const filtered = displayPool.filter((p) => {
    let matchTab = true;
    if (activeTab === 'Active') matchTab = p.status === 'ACTIVE';
    else if (activeTab === 'Planned') matchTab = p.status === 'PLANNED';
    else if (activeTab === 'Completed') matchTab = p.status === 'COMPLETED';

    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.branchName.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q));

    return matchTab && matchSearch;
  });

  const handleCreateProject = (payload: CreateProjectPayload) => {
    const today = new Date().toISOString().slice(0, 10);

    const membersData: ProjectMemberData[] = payload.members.map((m, idx) => {
      const emp = AVAILABLE_EMPLOYEES.find((e) => e.id === m.employeeId);
      return {
        id: `pm-new-${Date.now()}-${idx}`,
        employeeId: m.employeeId,
        firstName: emp?.firstName || 'Employee',
        lastName: emp?.lastName || '',
        employeeNumber: emp?.employeeNumber || `EMP-${m.employeeId}`,
        projectRole: m.projectRole,
        allocationPercentage: m.allocationPercentage.toFixed(2),
        startsOn: payload.startDate || today,
        endsOn: payload.endDate || null,
        avatarInitials: emp?.avatarInitials || 'EM',
      };
    });

    const newProject: ProjectData = {
      id: `proj-${Date.now()}`,
      code: payload.code,
      name: payload.name,
      description: payload.description || null,
      status: payload.status,
      startDate: payload.startDate || today,
      endDate: payload.endDate || null,
      branchName: payload.branchName,
      createdAt: today,
      members: membersData,
    };

    const nextProjects = [newProject, ...projects];
    setProjects(nextProjects);
    setActiveTab('All Projects');
    setSelectedProject(newProject);
    setToastMessage(
      `Project "${newProject.code} – ${newProject.name}" created successfully with ${newProject.members.length} members!`,
    );

    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleAssignMember = (payload: {
    projectId: string;
    employeeId: string;
    projectRole: string;
    allocationPercentage: number;
    startsOn: string;
    endsOn: string | null;
  }) => {
    const emp = AVAILABLE_EMPLOYEES.find((e) => e.id === payload.employeeId);
    if (!emp) return;

    const newMember: ProjectMemberData = {
      id: `pm-${Date.now()}`,
      employeeId: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      employeeNumber: emp.employeeNumber,
      projectRole: payload.projectRole,
      allocationPercentage: `${payload.allocationPercentage}%`,
      startsOn: payload.startsOn,
      endsOn: payload.endsOn,
      avatarInitials: emp.avatarInitials,
    };

    const nextProjects = projects.map((p) =>
      p.id === payload.projectId ? { ...p, members: [...p.members, newMember] } : p,
    );

    setProjects(nextProjects);
    setToastMessage(`Assigned ${emp.firstName} ${emp.lastName} to project!`);
    setTimeout(() => setToastMessage(null), 4000);
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

      {/* 1. Sub-Tabs & Actions Toolbar */}
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

          {/* Right: Search, View Mode Switcher, + Assign Member, + New Project */}
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
                placeholder="Search projects…"
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

            {/* Quick Action: Assign Member */}
            {isAdmin && (
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-[4px] shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>+ Assign Member</span>
              </button>
            )}

            {/* Primary CTA: New Project */}
            {isAdmin && (
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
                <span>New Project</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Scrollable Content Area */}
      <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 pb-6 pt-3.5">
        {activeTab === 'Staffing Matrix' ? (
          <StaffingMatrixView
            projects={projects}
            onOpenAssign={() => setIsAssignModalOpen(true)}
            canManage={isAdmin}
          />
        ) : filtered.length === 0 ? (
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
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <div className="text-sm font-bold text-slate-700">No projects found</div>
            <p className="text-xs text-slate-500 mt-1">
              Try switching tabs, searching for another keyword, or create a new project.
            </p>
            {isAdmin && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-[4px] shadow-xs cursor-pointer"
              >
                + Create Project
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => setSelectedProject(project)}
              />
            ))}
          </div>
        ) : (
          <ProjectTable projects={filtered} onSelect={(p) => setSelectedProject(p)} />
        )}
      </div>

      {/* Detail Slide-in Drawer */}
      {selectedProject && (
        <ProjectDetailDrawer
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onOpenAssign={() => setIsAssignModalOpen(true)}
        />
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateProject}
      />

      {/* Assign Member Modal */}
      <AssignProjectMemberModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        projects={projects}
        selectedProjectId={selectedProject?.id}
        onAssign={handleAssignMember}
      />
    </div>
  );
}
