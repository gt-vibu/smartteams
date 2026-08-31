'use client';

import { Button, Checkbox, Input, Textarea } from '@smarteam/ui';

import React, { useState, useEffect } from 'react';
import { Select } from '@smarteam/ui';
import onboardingFixture from '../../data/fixtures/onboarding.json';
import type {
  CandidateRecord,
  CandidateStage,
  OnboardingDocument,
  ProvisionedAsset,
} from '../../types/onboarding.types';
import { OnboardWizardModal } from './onboard-wizard-modal';
import { emsStorageAdapter } from '../../storage/storage.adapter';

const STORAGE_KEY_CANDIDATES = 'ems_onboarding_candidates';

const STAGES: { id: CandidateStage; label: string; badgeCls: string; dotCls: string }[] = [
  {
    id: 'OFFER_ACCEPTED',
    label: 'Offer Accepted',
    badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dotCls: 'bg-indigo-500',
  },
  {
    id: 'PRE_BOARDING',
    label: 'Pre-boarding',
    badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',
    dotCls: 'bg-amber-500',
  },
  {
    id: 'DOCS_VERIFICATION',
    label: 'Docs Verification',
    badgeCls: 'bg-purple-50 text-purple-700 border-purple-200',
    dotCls: 'bg-purple-500',
  },
  {
    id: 'ASSET_PROVISIONING',
    label: 'Asset Provisioning',
    badgeCls: 'bg-sky-50 text-sky-700 border-sky-200',
    dotCls: 'bg-sky-500',
  },
  {
    id: 'DAY1_READY',
    label: 'Day 1 Ready',
    badgeCls: 'bg-teal-50 text-teal-700 border-teal-200',
    dotCls: 'bg-teal-500',
  },
  {
    id: 'COMPLETED',
    label: 'Completed & Joined',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotCls: 'bg-emerald-500',
  },
];

export function ScreenOnboarding() {
  const [candidates, setCandidates] = useState<CandidateRecord[]>(() => {
    return emsStorageAdapter.getItem<CandidateRecord[]>(
      STORAGE_KEY_CANDIDATES,
      onboardingFixture.candidates as CandidateRecord[],
    );
  });

  const [activeTab, setActiveTab] = useState<
    'PIPELINE' | 'CHECKLISTS' | 'DOCUMENTS' | 'ASSETS' | 'WORKFLOWS'
  >('PIPELINE');
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateRecord | null>(null);

  // Document review modal state
  const [reviewingDoc, setReviewingDoc] = useState<{
    candidateId: string;
    doc: OnboardingDocument;
  } | null>(null);
  const [reviewerRemarks, setReviewerRemarks] = useState('');

  const refreshStorage = () => {
    setCandidates(
      emsStorageAdapter.getItem<CandidateRecord[]>(
        STORAGE_KEY_CANDIDATES,
        onboardingFixture.candidates as CandidateRecord[],
      ),
    );
  };

  useEffect(() => {
    window.addEventListener('ems:storage:change', refreshStorage);
    return () => window.removeEventListener('ems:storage:change', refreshStorage);
  }, []);

  const saveCandidates = (updated: CandidateRecord[]) => {
    setCandidates(updated);
    emsStorageAdapter.setItem(STORAGE_KEY_CANDIDATES, updated);
  };

  const handleCompleteWizard = (newCandidate: CandidateRecord) => {
    const next = [newCandidate, ...candidates];
    saveCandidates(next);
    setIsWizardOpen(false);
    setSelectedCandidate(newCandidate);

    // Also register in employee directory if needed
    window.dispatchEvent(new CustomEvent('ems:storage:change'));
  };

  const handleToggleTask = (candidateId: string, taskId: string) => {
    const next = candidates.map((c) => {
      if (c.id !== candidateId) return c;
      const updatedChecklist = c.checklist.map((t) =>
        t.id === taskId
          ? {
              ...t,
              isCompleted: !t.isCompleted,
              completedAt: !t.isCompleted ? new Date().toISOString().split('T')[0]! : null,
            }
          : t,
      );
      const completedCount = updatedChecklist.filter((t) => t.isCompleted).length;
      const progress = Math.round((completedCount / (updatedChecklist.length || 1)) * 100);
      return {
        ...c,
        checklist: updatedChecklist,
        progressPercentage: progress,
        stage: progress === 100 ? 'COMPLETED' : c.stage,
      };
    });

    saveCandidates(next);
    if (selectedCandidate && selectedCandidate.id === candidateId) {
      setSelectedCandidate(next.find((c) => c.id === candidateId) || null);
    }
  };

  const handleUpdateStage = (candidateId: string, newStage: CandidateStage) => {
    const next = candidates.map((c) =>
      c.id === candidateId
        ? {
            ...c,
            stage: newStage,
            progressPercentage: newStage === 'COMPLETED' ? 100 : c.progressPercentage,
          }
        : c,
    );
    saveCandidates(next);
    if (selectedCandidate && selectedCandidate.id === candidateId) {
      setSelectedCandidate(next.find((c) => c.id === candidateId) || null);
    }
  };

  const handleVerifyDocument = (
    candidateId: string,
    docId: string,
    status: 'VERIFIED' | 'REJECTED',
    remarks: string,
  ) => {
    const next = candidates.map((c) => {
      if (c.id !== candidateId) return c;
      return {
        ...c,
        documents: c.documents.map((d) =>
          d.id === docId
            ? {
                ...d,
                status,
                verifiedAt: new Date().toISOString().split('T')[0]!,
                reviewerRemarks:
                  remarks ||
                  (status === 'VERIFIED'
                    ? 'Approved by People Ops compliance.'
                    : 'Rejected due to insufficient clarity.'),
              }
            : d,
        ),
      };
    });
    saveCandidates(next);
    setReviewingDoc(null);
    setReviewerRemarks('');
  };

  // Filter candidates
  const filteredCandidates = candidates.filter((c) => {
    if (selectedStageFilter !== 'ALL' && c.stage !== selectedStageFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.candidateName.toLowerCase().includes(q) ||
        c.jobTitle.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q) ||
        c.employeeNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalCandidates = candidates.length;
  const inProgress = candidates.filter((c) => c.stage !== 'COMPLETED').length;
  const pendingDocsCount = candidates.reduce(
    (acc, c) => acc + c.documents.filter((d) => d.status === 'PENDING').length,
    0,
  );
  const totalAssetsDispatched = candidates.reduce(
    (acc, c) =>
      acc + c.assets.filter((a) => a.status === 'DISPATCHED' || a.status === 'DELIVERED').length,
    0,
  );

  return (
    <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto w-full min-w-0">
      {/* Header Banner */}
      <div className="bg-white dark:bg-card rounded-lg border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              Talent Operations
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Employee Onboarding & Lifecycle
            </span>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white mt-1.5 break-words">
            New Hire Onboarding Hub
          </h1>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsWizardOpen(true)}
            className="w-full sm:w-auto justify-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-md shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Onboard New Hire</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-card p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Active Pipeline
          </div>
          <div className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {inProgress} Candidates
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{totalCandidates} total tracked</div>
        </div>

        <div className="bg-white dark:bg-card p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Docs Pending Audit
          </div>
          <div className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
            {pendingDocsCount} Documents
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">KYC & academic degrees</div>
        </div>

        <div className="bg-white dark:bg-card p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Hardware Dispatched
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-700 dark:text-slate-300 mt-0.5">
            {totalAssetsDispatched} Assets
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">MacBooks & 4K Monitors</div>
        </div>

        <div className="bg-white dark:bg-card p-3.5 rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Ready for Day 1
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {candidates.filter((c) => c.stage === 'DAY1_READY' || c.stage === 'COMPLETED').length}{' '}
            Hires
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Accounts & team aligned</div>
        </div>
      </div>

      {/* Sub-Navigation Tabs Bar */}
      <div className="bg-white dark:bg-card rounded-lg border border-slate-200 dark:border-slate-800 p-1.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('PIPELINE')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-[4px] transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'PIPELINE'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Candidate Pipeline ({candidates.length})
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('CHECKLISTS')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-[4px] transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'CHECKLISTS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Onboarding Checklists
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('DOCUMENTS')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-[4px] transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'DOCUMENTS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Document Verification {pendingDocsCount > 0 && `(${pendingDocsCount})`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('ASSETS')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-[4px] transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'ASSETS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Asset & Kit Allocation
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('WORKFLOWS')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-[4px] transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'WORKFLOWS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Templates & Policies
          </Button>
        </div>

        {/* Search */}
        <div className="relative shrink-0 max-w-xs">
          <Input
            type="text"
            placeholder="Search candidate or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs px-2.5 py-1 pl-7 bg-slate-50 border border-slate-200 rounded-[4px] focus:ring-1 focus:ring-sky-500 w-48 sm:w-56"
          />
          <svg
            className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-2"
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
        </div>
      </div>

      {/* ── TAB 1: PIPELINE & CANDIDATE DOSSIERS ── */}
      {activeTab === 'PIPELINE' && (
        <div className="space-y-4">
          {/* Stage Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            <Button
              onClick={() => setSelectedStageFilter('ALL')}
              className={`px-3 py-1 rounded-[4px] font-semibold border transition-all cursor-pointer ${
                selectedStageFilter === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              All Stages ({candidates.length})
            </Button>
            {STAGES.map((st) => {
              const count = candidates.filter((c) => c.stage === st.id).length;
              return (
                <Button
                  key={st.id}
                  onClick={() => setSelectedStageFilter(st.id)}
                  className={`px-3 py-1 rounded-[4px] font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedStageFilter === st.id
                      ? `${st.badgeCls} ring-1 ring-offset-1 font-bold`
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${st.dotCls}`} />
                  <span>{st.label}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </Button>
              );
            })}
          </div>

          {/* Candidate Table */}
          <div className="bg-white dark:bg-card rounded-lg border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden w-full overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-2.5 px-4">Candidate</th>
                  <th className="py-2.5 px-3">Role & Dept</th>
                  <th className="py-2.5 px-3">Branch & Manager</th>
                  <th className="py-2.5 px-3">Joining Date</th>
                  <th className="py-2.5 px-3">Stage</th>
                  <th className="py-2.5 px-3">Checklist Progress</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No candidates match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map((c) => {
                    const stCfg = STAGES.find((s) => s.id === c.stage) || STAGES[0]!;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedCandidate(c)}
                        className="hover:bg-sky-50/40 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center shrink-0">
                              {c.avatarInitials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                                {c.candidateName}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {c.employeeNumber} · {c.workEmail}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{c.jobTitle}</div>
                          <div className="text-[10px] text-slate-500">{c.department}</div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="text-slate-700">{c.branchName}</div>
                          <div className="text-[10px] text-slate-400">
                            Reports to {c.managerName}
                          </div>
                        </td>

                        <td className="py-3 px-3 font-medium text-slate-700">{c.joiningDate}</td>

                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${stCfg.badgeCls}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${stCfg.dotCls}`} />
                            {stCfg.label}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <div className="w-28 space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                              <span>Tasks</span>
                              <span>{c.progressPercentage}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  c.progressPercentage === 100
                                    ? 'bg-emerald-500'
                                    : c.progressPercentage > 50
                                      ? 'bg-sky-500'
                                      : 'bg-amber-500'
                                }`}
                                style={{ width: `${c.progressPercentage}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <span className="text-xs font-semibold text-primary group-hover:underline">
                            View Dossier →
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: ONBOARDING CHECKLISTS & TASKS ── */}
      {activeTab === 'CHECKLISTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Candidate selector column */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Select Candidate Roster
            </h3>
            <div className="space-y-1.5">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCandidate(c)}
                  className={`p-3 rounded-[6px] border transition-all cursor-pointer flex items-center justify-between ${
                    selectedCandidate?.id === c.id
                      ? 'bg-sky-50 border-sky-300 ring-1 ring-sky-200'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900">{c.candidateName}</div>
                    <div className="text-[10px] text-slate-500">
                      {c.jobTitle} · Starts {c.joiningDate}
                    </div>
                  </div>
                  <span className="text-xs font-bold font-mono text-primary">
                    {c.progressPercentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Candidate Checklist Details */}
          <div className="lg:col-span-2 space-y-4">
            {selectedCandidate ? (
              <div className="bg-white rounded-[6px] border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">
                        {selectedCandidate.candidateName}’s Onboarding Track
                      </h2>
                      <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold">
                        {selectedCandidate.employeeNumber}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedCandidate.jobTitle} · {selectedCandidate.department}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Stage:</span>
                    <div className="w-44">
                      <Select
                        value={selectedCandidate.stage}
                        onChange={(e) =>
                          handleUpdateStage(selectedCandidate.id, e.target.value as CandidateStage)
                        }
                      >
                        {STAGES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 bg-slate-50 p-3 rounded-[6px] border border-slate-100">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>Overall Completion</span>
                    <span className="font-mono text-primary">
                      {selectedCandidate.progressPercentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all rounded-full"
                      style={{ width: `${selectedCandidate.progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Task Items */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Action Items & Deliverables ({selectedCandidate.checklist.length})
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-[6px]">
                    {selectedCandidate.checklist.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => handleToggleTask(selectedCandidate.id, task.id)}
                        className={`p-3 flex items-start gap-3 transition-colors cursor-pointer hover:bg-slate-50 ${
                          task.isCompleted ? 'bg-emerald-50/30' : 'bg-white'
                        }`}
                      >
                        <Checkbox
                          checked={task.isCompleted}
                          onCheckedChange={() => {}} // handled by row click
                          aria-label={`Mark ${task.title} complete`}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold ${
                                task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'
                              }`}
                            >
                              {task.title}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {task.assignedRole}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{task.description}</p>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Due: {task.dueDate}{' '}
                            {task.completedAt ? `· Completed on ${task.completedAt}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[6px] border border-slate-200 p-12 text-center text-slate-400 text-xs">
                Select a candidate on the left to review and manage their onboarding tasks.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: DOCUMENT VERIFICATION ── */}
      {activeTab === 'DOCUMENTS' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Review uploaded identification, academic, and tax documents submitted by candidates
            prior to Day 1.
          </p>

          <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-2.5 px-4">Candidate</th>
                  <th className="py-2.5 px-3">Document Title</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Verification Details</th>
                  <th className="py-2.5 px-3 text-right">Audit Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.flatMap((c) =>
                  c.documents.map((d) => (
                    <tr key={`${c.id}-${d.id}`} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {c.candidateName}
                        <div className="text-[10px] text-slate-400 font-mono">
                          {c.employeeNumber}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">{d.title}</td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                          {d.type}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-sky-700 underline cursor-pointer">
                        {d.fileName}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            d.status === 'VERIFIED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : d.status === 'REJECTED'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-500">
                        {d.reviewerRemarks || 'Pending compliance audit'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button
                          onClick={() => setReviewingDoc({ candidateId: c.id, doc: d })}
                          className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors cursor-pointer"
                        >
                          Audit & Verify
                        </Button>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: ASSET & HARDWARE PROVISIONING ── */}
      {activeTab === 'ASSETS' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Track IT hardware fulfillment, serial numbers, security keys, and delivery status for
            upcoming hires.
          </p>

          <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-2.5 px-4">Assigned To</th>
                  <th className="py-2.5 px-3">Asset Type</th>
                  <th className="py-2.5 px-3">Model & Specs</th>
                  <th className="py-2.5 px-3">Serial Number</th>
                  <th className="py-2.5 px-3">Fulfillment Status</th>
                  <th className="py-2.5 px-3">Courier / Handover</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.flatMap((c) =>
                  c.assets.map((a) => (
                    <tr key={`${c.id}-${a.id}`} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {c.candidateName}
                        <div className="text-[10px] text-slate-400">{c.jobTitle}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {a.assetType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">{a.modelName}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                        {a.serialNumber}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            a.status === 'DELIVERED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : a.status === 'DISPATCHED'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-500 font-mono">
                        {a.trackingNumber || 'In Bengaluru HQ Locker'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button
                          onClick={() => {
                            const nextStatus: ProvisionedAsset['status'] =
                              a.status === 'ORDERED'
                                ? 'ASSIGNED'
                                : a.status === 'ASSIGNED'
                                  ? 'DISPATCHED'
                                  : 'DELIVERED';
                            const next = candidates.map((can) =>
                              can.id === c.id
                                ? {
                                    ...can,
                                    assets: can.assets.map((item) =>
                                      item.id === a.id ? { ...item, status: nextStatus } : item,
                                    ),
                                  }
                                : can,
                            );
                            saveCandidates(next);
                          }}
                          className="px-2 py-0.5 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 cursor-pointer"
                        >
                          Update Status →
                        </Button>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: TEMPLATES & WORKFLOWS ── */}
      {activeTab === 'WORKFLOWS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-[6px] border border-slate-200 p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800">Engineering Track Onboarding</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Active Template
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Standard 30-day workflow for Software Engineers, QA, and DevOps hires. Includes AWS
              IAM access, GitHub Enterprise licenses, CI/CD walkthrough, and Day 1 pairing buddy.
            </p>
            <div className="text-[10px] text-slate-400 font-mono">
              6 automated tasks · 3 asset kits
            </div>
          </div>

          <div className="bg-white rounded-[6px] border border-slate-200 p-4 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800">Product & Design Onboarding</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Active Template
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Design systems orientation, Figma org seat provisioning, user research archive
              walkthrough, and product squad roadmap alignment.
            </p>
            <div className="text-[10px] text-slate-400 font-mono">
              5 automated tasks · 2 asset kits
            </div>
          </div>
        </div>
      )}

      {/* Candidate Dossier Drawer */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-modal="true">
          <div
            onClick={() => setSelectedCandidate(null)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
          />
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-lg bg-white shadow-2xl border-l border-slate-200 flex flex-col justify-between">
              <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700">
                      {selectedCandidate.employeeNumber}
                    </span>
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                      {selectedCandidate.stage.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900">
                    {selectedCandidate.candidateName}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedCandidate.jobTitle} · {selectedCandidate.department}
                  </p>
                </div>
                <Button
                  onClick={() => setSelectedCandidate(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  ✕
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
                {/* Contact */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Contact & Organization
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-[6px] border border-slate-100">
                    <div>
                      <span className="text-slate-500">Email:</span>
                      <div className="font-semibold text-slate-800">
                        {selectedCandidate.workEmail}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Phone:</span>
                      <div className="font-semibold text-slate-800">{selectedCandidate.phone}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Branch:</span>
                      <div className="font-semibold text-slate-800">
                        {selectedCandidate.branchName}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Manager:</span>
                      <div className="font-semibold text-slate-800">
                        {selectedCandidate.managerName}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team & Project */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Squad & Project Staffing
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-[6px] border border-slate-100">
                    <div>
                      <span className="text-slate-500">Assigned Squad:</span>
                      <div className="font-bold text-indigo-700">
                        {selectedCandidate.assignedTeamName || 'Unassigned'}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Project:</span>
                      <div className="font-bold text-slate-800">
                        {selectedCandidate.assignedProjectName || 'General'} (
                        {selectedCandidate.allocationPercentage || 100}%)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Compensation */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Compensation Package
                  </div>
                  <div className="bg-emerald-50/60 p-3 rounded-[6px] border border-emerald-200 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-emerald-900 text-sm">
                        ₹{selectedCandidate.compensation.annualCtc.toLocaleString('en-IN')} / annum
                      </div>
                      <div className="text-[11px] text-emerald-700">
                        {selectedCandidate.compensation.payFrequency} payroll
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-white text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
                      FTE Structure
                    </span>
                  </div>
                </div>

                {/* Checklist Summary */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Checklist Completion
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {selectedCandidate.progressPercentage}%
                    </span>
                  </div>
                  <div className="space-y-1 divide-y divide-slate-100 border border-slate-100 rounded">
                    {selectedCandidate.checklist.map((task) => (
                      <div key={task.id} className="p-2 flex items-center justify-between">
                        <span
                          className={
                            task.isCompleted
                              ? 'text-slate-400 line-through'
                              : 'text-slate-700 font-medium'
                          }
                        >
                          {task.title}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${task.isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {task.isCompleted ? 'Done' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Document Modal */}
      {reviewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Audit Document: {reviewingDoc.doc.title}
            </h3>
            <div className="p-3 bg-slate-50 rounded border text-xs space-y-1">
              <div>
                <strong>File:</strong> {reviewingDoc.doc.fileName}
              </div>
              <div>
                <strong>Type:</strong> {reviewingDoc.doc.type}
              </div>
              <div>
                <strong>Uploaded:</strong> {reviewingDoc.doc.submittedAt}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Auditor / Review Remarks
              </label>
              <Textarea
                rows={2}
                value={reviewerRemarks}
                onChange={(e) => setReviewerRemarks(e.target.value)}
                placeholder="e.g. Verified with government portal. Clear."
                className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                onClick={() => setReviewingDoc(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() =>
                  handleVerifyDocument(
                    reviewingDoc.candidateId,
                    reviewingDoc.doc.id,
                    'REJECTED',
                    reviewerRemarks,
                  )
                }
                className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded"
              >
                Reject Document
              </Button>
              <Button
                type="button"
                onClick={() =>
                  handleVerifyDocument(
                    reviewingDoc.candidateId,
                    reviewingDoc.doc.id,
                    'VERIFIED',
                    reviewerRemarks,
                  )
                }
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-xs"
              >
                ✓ Approve & Verify
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Wizard Modal */}
      <OnboardWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleCompleteWizard}
      />
    </div>
  );
}
