'use client';

import React from 'react';
import { hasPermission } from '@smarteam/contracts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@smarteam/ui';
import { useAuth } from '../../hooks/use-auth';
import type { OrganizationState } from '../../hooks/use-organization';
import { OrgAccessPanel } from './org-access-panel';
import { OrgBranchesPanel } from './org-branches-panel';
import { OrgDepartmentsPanel } from './org-departments-panel';
import { OrgListsPanel } from './org-lists-panel';
import { OrgProfilePanel } from './org-profile-panel';

type Section = 'branches' | 'departments' | 'job-architecture' | 'access' | 'profile';

/** Organization configuration lives together on its own page, away from the overview summary. */
export function OrgSetupPanel({ organization, section = 'branches', onSectionChange }: { organization: OrganizationState; section?: Section; onSectionChange?: (section: Section) => void }) {
  const { persona } = useAuth();
  const may = (permission: string) => hasPermission(persona.permissions, permission);
  const canAccess = may('members.read') || may('rbac.read');
  const sections = (
    [
      { id: 'branches', label: 'Branches', allowed: may('branches.read') },
      {
        id: 'departments',
        label: 'Departments',
        allowed: may('employees.read.all') || may('employees.write'),
      },
      {
        id: 'job-architecture',
        label: 'Job architecture',
        allowed: may('employees.write') || may('projects.write') || may('teams.write'),
      },
      { id: 'access', label: 'Access profiles', allowed: canAccess },
      { id: 'profile', label: 'Organization profile', allowed: may('organizations.read') },
    ] satisfies Array<{ id: Section; label: string; allowed: boolean }>
  ).filter((entry) => entry.allowed);
  const active = sections.some((entry) => entry.id === section) ? section : sections[0]?.id;

  return (
    <section className="space-y-5" aria-label="Organization setup">
      <Tabs
        className="space-y-5"
        onValueChange={(value) => onSectionChange?.(value as Section)}
        value={active ?? ''}
      >
        {sections.length > 0 && (
          <TabsList
            aria-label="Organization setup sections"
            className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0"
          >
            {sections.map((entry) => (
              <TabsTrigger
                className="h-11 shrink-0 rounded-none border-b-2 border-transparent px-4 text-sm text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                key={entry.id}
                value={entry.id}
              >
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {sections.map((entry) => (
          <TabsContent className="mt-0 focus-visible:ring-0" key={entry.id} value={entry.id}>
            {entry.id === 'branches' && <OrgBranchesPanel organization={organization} />}
            {entry.id === 'departments' && <OrgDepartmentsPanel />}
            {entry.id === 'job-architecture' && <OrgListsPanel />}
            {entry.id === 'access' && <OrgAccessPanel />}
            {entry.id === 'profile' && <OrgProfilePanel organization={organization} />}
          </TabsContent>
        ))}
      </Tabs>
      {sections.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          You do not have permission to manage organization settings.
        </p>
      )}
    </section>
  );
}
