'use client';

import { useRef } from 'react';
import type { ColumnDef } from '@smarteam/ui';
import { Button, StandardDataTable, useFocusTrap } from '@smarteam/ui';
import { AVAILABLE_EMPLOYEES } from '../screen-teams/create-team-modal';
import type { ProjectStatus } from './create-project-modal';
import type { ProjectData, ProjectMemberData } from './screen-projects';
import { useAuth } from '../../hooks/use-auth';

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
  const cfg = STATUS_CONFIG[status];
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
export function ProjectCard({ project, onClick }: { project: ProjectData; onClick: () => void }) {
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
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary dark:group-hover:text-sky-400 transition-colors line-clamp-1 mb-1">
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
          <span className="text-[10px] font-semibold text-primary dark:text-sky-400 group-hover:underline">
            View details →
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────
export function ProjectTable({
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
        <span className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline cursor-pointer">
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
export function StaffingMatrixView({
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
          <Button
            variant="default"
            size="sm"
            onClick={onOpenAssign}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-[5px] shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Assign Team Member</span>
          </Button>
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
                      <Button
                        onClick={onOpenAssign}
                        className="px-2 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 cursor-pointer"
                      >
                        + Assign
                      </Button>
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
export function ProjectDetailDrawer({
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
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef, onClose);

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
          aria-labelledby="project-detail-title"
          tabIndex={-1}
          className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-bold text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                  {project.code}
                </span>
                <StatusBadge status={project.status} />
              </div>
              <h2 id="project-detail-title" className="text-sm font-bold text-slate-900 mt-1">
                {project.name}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close project details"
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
            {project.description && (
              <div className="bg-muted/60 border border-slate-200/80 rounded-[6px] p-3.5">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenAssign}
                    className="text-[11px] font-bold text-slate-800 hover:text-slate-900 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>+ Assign Member</span>
                  </Button>
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
