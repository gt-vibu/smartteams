'use client';

import React, { useState } from 'react';
import { Button, Input } from '@smarteam/ui';
import type { CreateTeamPayload } from './create-team-modal';
import { CreateTeamModal, AVAILABLE_EMPLOYEES } from './create-team-modal';

import { useTeams } from '../../hooks/use-teams';
import type { TeamData, TeamMemberData } from '../../hooks/use-teams';
import { useAuth } from '../../hooks/use-auth';

import { TeamCard, TeamTable, TeamDetailDrawer } from './team-views';

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
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams…"
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
              </Button>
            </div>

            {/* Primary CTA: + New Team (Strictly for ADMIN context) */}
            {workspaceContext === 'ADMIN' && (
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
                <span className="hidden xs:inline">New Team</span>
              </Button>
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
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-[4px] shadow-xs cursor-pointer"
              >
                + Create Team
              </Button>
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
