'use client';

import { Button, Input } from '@smarteam/ui';

import React, { useState } from 'react';
import { Select } from '@smarteam/ui';
import type { OrgEmployeeNode } from '../../types/organization.types';

interface OrgEmployeeTreeTabProps {
  treeRoot: OrgEmployeeNode | null;
}

interface TreeNodeComponentProps {
  node: OrgEmployeeNode;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  searchQuery: string;
  selectedBranch: string;
}

function TreeNodeItem({
  node,
  expandedIds,
  onToggleExpand,
  searchQuery,
  selectedBranch,
}: TreeNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  // Check if this node or any child matches search/filter
  const matchesSearch =
    !searchQuery ||
    node.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.department.toLowerCase().includes(searchQuery.toLowerCase());

  const matchesBranch = selectedBranch === 'ALL' || node.branchId === selectedBranch;

  return (
    <div className="flex flex-col items-center">
      {/* Node Card */}
      <div
        className={`w-64 p-3 rounded-[6px] border shadow-xs transition-all bg-white relative group cursor-pointer ${
          matchesSearch && matchesBranch
            ? 'border-slate-300 hover:border-sky-400 hover:shadow-md'
            : 'opacity-40 border-slate-200'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="h-9 w-9 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {node.avatarInitials}
            </div>
            {node.isOnline && (
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 truncate">
                {node.firstName} {node.lastName}
              </h4>
              <span className="text-[9px] text-slate-400 font-mono font-medium">
                {node.employeeNumber}
              </span>
            </div>
            <p className="text-[10px] font-semibold text-primary truncate mt-0.5">
              {node.jobTitle}
            </p>
            <div className="text-[9px] text-slate-500 truncate mt-1">
              {node.department} · {node.branchName}
            </div>
          </div>
        </div>

        {/* Direct Reports Count Badge / Expand Toggle */}
        {hasChildren && (
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500">
              👥 {node.children.length} direct report{node.children.length !== 1 ? 's' : ''}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 hover:bg-sky-100 hover:text-sky-700 text-slate-600 transition-colors flex items-center gap-1 cursor-pointer h-auto"
            >
              <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
              <span>{isExpanded ? '▲' : '▼'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Children Tree Nodes */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col items-center">
          {/* Vertical Connecting Line */}
          <div className="w-0.5 h-6 bg-slate-300" />

          {/* Horizontal Connector Bar */}
          <div className="flex items-start justify-center relative pt-4">
            {node.children.map((child, index) => (
              <div key={child.id} className="relative px-3 flex flex-col items-center">
                {/* Horizontal guide connectors */}
                {node.children.length > 1 && (
                  <div
                    className={`absolute top-0 h-0.5 bg-slate-300 ${
                      index === 0
                        ? 'left-1/2 right-0'
                        : index === node.children.length - 1
                          ? 'left-0 right-1/2'
                          : 'left-0 right-0'
                    }`}
                  />
                )}
                {/* Vertical drop line */}
                <div className="w-0.5 h-4 bg-slate-300 absolute top-0" />

                <TreeNodeItem
                  node={child}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                  searchQuery={searchQuery}
                  selectedBranch={selectedBranch}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrgEmployeeTreeTab({ treeRoot }: OrgEmployeeTreeTabProps) {
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Expand root by default
    const set = new Set<string>();
    if (treeRoot) set.add(treeRoot.id);
    if (treeRoot?.children) {
      treeRoot.children.forEach((c) => set.add(c.id));
    }
    return set;
  });

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const all = new Set<string>();
    function collect(node: OrgEmployeeNode) {
      all.add(node.id);
      node.children.forEach(collect);
    }
    if (treeRoot) collect(treeRoot);
    setExpandedIds(all);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set(treeRoot ? [treeRoot.id] : []));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white rounded-[6px] border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-[600px]">
      {/* ── Toolbar Header ── */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Title + Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-48 sm:w-60">
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
              placeholder="Search employee in hierarchy…"
              className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Branch Filter */}
          <div className="w-44">
            <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="ALL">All Branches</option>
              <option value="branch-hq">HQ – Bengaluru</option>
              <option value="branch-mum">Mumbai Office</option>
              <option value="branch-del">Delhi Office</option>
            </Select>
          </div>
        </div>

        {/* Right: Expand/Collapse & Print Actions */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded shadow-2xs transition-colors cursor-pointer"
          >
            Expand All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded shadow-2xs transition-colors cursor-pointer"
          >
            Collapse All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handlePrint}
            className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded shadow-2xs transition-colors cursor-pointer"
            title="Print Organization Hierarchy"
            aria-label="Print Org Tree"
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
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* ── Tree Canvas ── */}
      <div className="flex-1 p-8 overflow-auto bg-[#F8FAFC] flex justify-center items-start min-h-[500px]">
        {treeRoot ? (
          <TreeNodeItem
            node={treeRoot}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            searchQuery={search}
            selectedBranch={branchFilter}
          />
        ) : (
          <div className="p-12 text-center text-xs text-slate-400">
            No employee hierarchy available.
          </div>
        )}
      </div>
    </div>
  );
}
