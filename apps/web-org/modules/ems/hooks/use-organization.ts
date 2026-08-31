'use client';

import { useState, useCallback, useMemo } from 'react';
import orgFixture from '../data/fixtures/organization.json';
import type {
  OrganizationData,
  BranchData,
  DepartmentData,
  ApprovalPolicyData,
  AnnouncementData,
  MilestoneData,
  OrgEmployeeNode,
  OrgEmployeeSummary,
} from '../types/organization.types';
import { emsStorageAdapter } from '../storage/storage.adapter';

const STORAGE_KEY_ORG = 'ems_org_profile';
const STORAGE_KEY_BRANCHES = 'ems_org_branches';
const STORAGE_KEY_ANNOUNCEMENTS = 'ems_org_announcements';
const STORAGE_KEY_QUICK_LINKS = 'ems_org_quick_links';

export interface QuickLinkItem {
  id: string;
  title: string;
  url?: string;
  moduleId?: string;
  iconName: string;
}

const DEFAULT_QUICK_LINKS: QuickLinkItem[] = [
  { id: 'ql-1', title: 'Apply for Leave', moduleId: 'time-off', iconName: 'calendar' },
  { id: 'ql-2', title: 'Log Timesheet Hours', moduleId: 'timesheet', iconName: 'clock' },
  { id: 'ql-3', title: 'View Attendance Records', moduleId: 'attendance', iconName: 'clipboard' },
  { id: 'ql-4', title: 'Holiday Calendar', moduleId: 'home', iconName: 'calendar' },
];

export function useOrganization() {
  const [organization, setOrganization] = useState<OrganizationData>(() =>
    emsStorageAdapter.getItem<OrganizationData>(
      STORAGE_KEY_ORG,
      orgFixture.organization as unknown as OrganizationData,
    ),
  );

  const [branches, setBranches] = useState<BranchData[]>(() =>
    emsStorageAdapter.getItem<BranchData[]>(
      STORAGE_KEY_BRANCHES,
      orgFixture.branches as unknown as BranchData[],
    ),
  );

  const [announcements, setAnnouncements] = useState<AnnouncementData[]>(() =>
    emsStorageAdapter.getItem<AnnouncementData[]>(
      STORAGE_KEY_ANNOUNCEMENTS,
      orgFixture.announcements as unknown as AnnouncementData[],
    ),
  );

  const [quickLinks, setQuickLinks] = useState<QuickLinkItem[]>(() =>
    emsStorageAdapter.getItem<QuickLinkItem[]>(STORAGE_KEY_QUICK_LINKS, DEFAULT_QUICK_LINKS),
  );

  const departments: DepartmentData[] = useMemo(() => {
    return orgFixture.departments as unknown as DepartmentData[];
  }, []);

  const approvalPolicies: ApprovalPolicyData[] = useMemo(() => {
    return orgFixture.approvalPolicies as unknown as ApprovalPolicyData[];
  }, []);

  const milestones: MilestoneData[] = useMemo(() => {
    return orgFixture.milestones as unknown as MilestoneData[];
  }, []);

  // Compute full flat list of all organization employees
  const allEmployees: OrgEmployeeSummary[] = useMemo(() => {
    const map = new Map<string, OrgEmployeeSummary>();
    departments.forEach((d) => {
      d.employees.forEach((emp) => {
        if (!map.has(emp.id)) {
          map.set(emp.id, emp);
        }
      });
    });
    return Array.from(map.values());
  }, [departments]);

  // Compute hierarchical reporting tree (Org Chart)
  const orgHierarchyTree: OrgEmployeeNode | null = useMemo(() => {
    if (allEmployees.length === 0) return null;

    // Create lookup nodes
    const nodeMap = new Map<string, OrgEmployeeNode>();
    allEmployees.forEach((emp) => {
      nodeMap.set(emp.id, {
        ...emp,
        directReportsCount: 0,
        children: [],
      });
    });

    allEmployees.forEach((emp) => {
      const currentNode = nodeMap.get(emp.id)!;
      if (emp.managerEmployeeId && nodeMap.has(emp.managerEmployeeId)) {
        const parentNode = nodeMap.get(emp.managerEmployeeId)!;
        parentNode.children.push(currentNode);
        parentNode.directReportsCount += 1;
      }
    });

    const rootEmployee = allEmployees.find(
      (emp) => !emp.managerEmployeeId || !nodeMap.has(emp.managerEmployeeId),
    );
    return rootEmployee
      ? (nodeMap.get(rootEmployee.id) ?? null)
      : (Array.from(nodeMap.values())[0] ?? null);
  }, [allEmployees]);

  const updateCoverUrl = useCallback((newUrl: string) => {
    setOrganization((prev) => {
      const updated = { ...prev, coverUrl: newUrl };
      emsStorageAdapter.setItem(STORAGE_KEY_ORG, updated);
      return updated;
    });
  }, []);

  const addAnnouncement = useCallback(
    (item: Omit<AnnouncementData, 'id' | 'likes' | 'commentsCount'>) => {
      const newItem: AnnouncementData = {
        ...item,
        id: `ann-${Date.now()}`,
        likes: 0,
        commentsCount: 0,
      };
      setAnnouncements((prev) => {
        const updated = [newItem, ...prev];
        emsStorageAdapter.setItem(STORAGE_KEY_ANNOUNCEMENTS, updated);
        return updated;
      });
    },
    [],
  );

  const addQuickLink = useCallback((link: Omit<QuickLinkItem, 'id'>) => {
    const newLink: QuickLinkItem = {
      ...link,
      id: `ql-${Date.now()}`,
    };
    setQuickLinks((prev) => {
      const updated = [...prev, newLink];
      emsStorageAdapter.setItem(STORAGE_KEY_QUICK_LINKS, updated);
      return updated;
    });
  }, []);

  const removeQuickLink = useCallback((id: string) => {
    setQuickLinks((prev) => {
      const updated = prev.filter((l) => l.id !== id);
      emsStorageAdapter.setItem(STORAGE_KEY_QUICK_LINKS, updated);
      return updated;
    });
  }, []);

  const addBranch = useCallback((branch: BranchData) => {
    setBranches((prev) => {
      const updated = [branch, ...prev];
      emsStorageAdapter.setItem(STORAGE_KEY_BRANCHES, updated);
      return updated;
    });
  }, []);

  return {
    organization,
    branches,
    departments,
    allEmployees,
    orgHierarchyTree,
    approvalPolicies,
    announcements,
    milestones,
    quickLinks,
    updateCoverUrl,
    addAnnouncement,
    addQuickLink,
    removeQuickLink,
    addBranch,
  };
}
