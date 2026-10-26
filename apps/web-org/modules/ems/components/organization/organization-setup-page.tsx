'use client';

import { useOrganization } from '../../hooks/use-organization';
import { PageShell } from '../layout/page-shell';
import { ScreenHeader } from '../common/screen-header';
import { OrgSetupPanel } from './org-setup-panel';
import { Settings2 } from 'lucide-react';
import { useScreenTab } from '../../hooks/use-screen-tab';

/** First-level home for organization configuration, separate from the organization summary. */
export function OrganizationSetupPage() {
  const organization = useOrganization();
  const [section, setSection] = useScreenTab('setup', ['branches', 'departments', 'job-architecture', 'access', 'profile'] as const, 'branches');
  return (
    <PageShell>
      <ScreenHeader
        icon={Settings2}
        title="Organization setup"
        description="Manage branches, departments, job titles, access profiles and organization details."
      />
      <OrgSetupPanel organization={organization} section={section} onSectionChange={setSection} />
    </PageShell>
  );
}
