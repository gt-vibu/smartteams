'use client';

import React, { useState } from 'react';
import { Button, Input } from '@smarteam/ui';
import projectsFixture from '../../data/fixtures/projects.json';

import { CreateProjectModal } from './create-project-modal';
import type { CreateProjectPayload, ProjectStatus } from './create-project-modal';
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

import {
  ProjectCard,
  ProjectTable,
  StaffingMatrixView,
  ProjectDetailDrawer,
} from './project-views';

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
      <div className="sticky top-0 z-20 bg-background">
        <div className="bg-white/95 backdrop-blur-md pt-3 pb-3 border-b border-slate-200/90 px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] w-full">
          {/* Sub-Tabs */}
          <div className="flex items-center space-x-4 sm:space-x-6 overflow-x-auto no-scrollbar py-0.5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <Button
                  key={tab}
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab(tab)}
                  className={`text-xs font-semibold pb-1 transition-colors relative whitespace-nowrap cursor-pointer rounded-none ${
                    isActive
                      ? 'text-slate-900 border-b-2 border-slate-900 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </Button>
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
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="w-36 bg-white pl-8 pr-3 xs:w-44 sm:w-52"
              />
            </div>

            {/* Grid / Table View Switcher */}
            <div className="flex items-center bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 h-8 w-8 transition-colors cursor-pointer rounded-none ${
                  viewMode === 'grid'
                    ? 'bg-slate-100 text-slate-900 font-bold'
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
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('table')}
                className={`p-1.5 h-8 w-8 transition-colors border-l border-slate-200 cursor-pointer rounded-none ${
                  viewMode === 'table'
                    ? 'bg-slate-100 text-slate-900 font-bold'
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
              </Button>
            </div>

            {/* Quick Action: Assign Member */}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAssignModalOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-[4px] shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>+ Assign Member</span>
              </Button>
            )}

            {/* Primary CTA: New Project */}
            {isAdmin && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-[4px] shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
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
              </Button>
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
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-[4px] shadow-xs cursor-pointer"
              >
                + Create Project
              </Button>
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
