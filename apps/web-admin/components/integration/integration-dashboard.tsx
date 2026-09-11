'use client';

import { useState } from 'react';
import { Button, Icon } from '@smarteam/ui';
import type { AdminSession } from '../../lib/api-client';
import { Brand } from '../brand';
import { FederationClients } from './federation-clients';
import { CompaniesDashboard } from '../companies/companies-dashboard';

interface IntegrationDashboardProps {
  session: AdminSession;
  onLogout: () => Promise<void>;
}

type DashboardTab = 'COMPANIES' | 'FEDERATION';

export function IntegrationDashboard({ session, onLogout }: IntegrationDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('COMPANIES');
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await onLogout();
  }

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-8">
            <Brand />

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/60">
              <button
                onClick={() => setActiveTab('COMPANIES')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'COMPANIES'
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                type="button"
              >
                <Icon className="size-3.5" name="building" />
                <span>Companies</span>
              </button>

              <button
                onClick={() => setActiveTab('FEDERATION')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'FEDERATION'
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                type="button"
              >
                <Icon className="size-3.5" name="key" />
                <span>Integrations</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-44 truncate text-[11px] font-mono text-muted-foreground">
                {session.user.email}
              </p>
            </div>
            <Button
              aria-label="Sign out"
              disabled={loggingOut}
              onClick={logout}
              type="button"
              variant="quiet"
              size="sm"
            >
              <Icon className="size-4" name="logout" />
              <span className="hidden sm:inline">{loggingOut ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
        {activeTab === 'COMPANIES' ? <CompaniesDashboard /> : <FederationClients />}
      </div>
    </main>
  );
}
