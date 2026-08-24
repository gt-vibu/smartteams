'use client';

import { useState } from 'react';
import { Button, Icon } from '@smarteam/ui';
import type { AdminSession } from '../../lib/api-client';
import { Brand } from '../brand';
import { FederationClients } from './federation-clients';

interface IntegrationDashboardProps {
  session: AdminSession;
  onLogout: () => Promise<void>;
}

export function IntegrationDashboard({ session, onLogout }: IntegrationDashboardProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await onLogout();
  }

  return (
    <main className="min-h-svh">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
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

      <div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
        <FederationClients session={session} />
      </div>
    </main>
  );
}
