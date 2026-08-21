'use client';

import { useState } from 'react';
import { Badge, Button, Icon } from '@smarteam/ui';
import type {
  AdminSession,
  FederationClientResult,
  FederationGrantResult,
  OrganizationResult,
} from '../../lib/api-client';
import { Brand } from '../brand';
import { IntegrationChecklist } from './checklist';
import { ClientForm } from './client-form';
import { GrantForm } from './grant-form';
import { SetupStep } from './setup-step';
import { TenantForm } from './tenant-form';

interface IntegrationDashboardProps {
  session: AdminSession;
  onLogout: () => Promise<void>;
}

export function IntegrationDashboard({ session, onLogout }: IntegrationDashboardProps) {
  const [organization, setOrganization] = useState<OrganizationResult | null>(null);
  const [client, setClient] = useState<FederationClientResult | null>(null);
  const [grant, setGrant] = useState<FederationGrantResult | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await onLogout();
  }

  return (
    <main className="min-h-svh">
      <header className="border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <Brand />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium">Platform operator</p>
              <p className="max-w-44 truncate text-[11px] text-muted-foreground">
                {session.userId}
              </p>
            </div>
            <Button
              aria-label="Sign out"
              disabled={loggingOut}
              onClick={logout}
              type="button"
              variant="quiet"
            >
              <Icon className="size-4" name="logout" />
              <span className="hidden sm:inline">{loggingOut ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="relative overflow-hidden">
        <div aria-hidden="true" className="admin-grid absolute inset-x-0 top-0 h-[420px]" />
        <div className="relative mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
          <section className="admin-reveal max-w-3xl">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Badge variant="success">
                <span className="size-1.5 rounded-full bg-success" />
                Protected workspace
              </Badge>
              <span className="text-xs text-muted-foreground">
                Temporary integration operator surface
              </span>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
              BlizBooks connection desk.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Create the tenant boundary, issue an mTLS-bound client, and grant only the federation
              scopes required for UAT.
            </p>
          </section>

          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="grid gap-5">
              <SetupStep
                description="Create a federation-owned organization boundary for the BlizBooks tenant."
                icon="building"
                number="01"
                status={organization ? 'Ready' : 'Required'}
                title="Create the tenant"
              >
                <TenantForm
                  onCreated={setOrganization}
                  organization={organization}
                  session={session}
                />
              </SetupStep>
              <SetupStep
                description="Register BlizBooks certificate identity and generate credentials once."
                icon="key"
                number="02"
                status={client ? 'Ready' : organization ? 'Next' : 'After tenant'}
                title="Generate client credentials"
              >
                <ClientForm
                  client={client}
                  onCreated={setClient}
                  organizationId={organization?.id ?? ''}
                  session={session}
                />
              </SetupStep>
              <SetupStep
                description="Bind the client to the tenant with explicit, auditable scopes."
                icon="shield"
                number="03"
                status={grant ? 'Ready' : client ? 'Next' : 'After client'}
                title="Create the access grant"
              >
                <GrantForm
                  client={client}
                  grant={grant}
                  onCreated={setGrant}
                  organization={organization}
                  session={session}
                />
              </SetupStep>
            </div>
            <div className="admin-reveal admin-reveal-delay">
              <IntegrationChecklist />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
