'use client';
import { employeeReadinessSchema } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

export function OnboardingReadinessPanel() {
  const { session, hasPermission } = useSession();
  const org = session?.organizationId;
  const [cursor, setCursor] = useState<string | null>(null);
  const feed = useAsyncResource(
    async () =>
      employeeReadinessSchema.parse(
        await apiRequest(
          orgPath(org!, `/employee-operations/readiness${cursor ? `?cursor=${cursor}` : ''}`),
          { method: 'GET' },
        ),
      ),
    [org, cursor],
    { enabled: Boolean(org) && hasPermission('employees.read.all') },
  );
  if (!hasPermission('employees.read.all')) return null;
  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">Employee readiness</h2>
        {feed.error && (
          <p role="alert" className="text-xs text-destructive">
            {feed.error}
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={feed.loading}
          onClick={() => void feed.refetch()}
        >
          Refresh readiness
        </Button>
        {feed.loading && (
          <p role="status" className="text-xs">
            Checking employee setup…
          </p>
        )}
        {feed.data?.items.map((item) => (
          <details key={item.id} className="rounded border border-border p-2 text-xs">
            <summary className="cursor-pointer">
              <span className="font-semibold">
                {item.name} · {item.employeeNumber}
              </span>
              <span className="ml-2 text-muted-foreground">
                {item.issues.length ? `${item.issues.length} setup items` : 'Ready'}
              </span>
            </summary>
            <div className="mt-2 space-y-1">
              {item.issues.map((issue) => (
                <p key={issue.code}>{issue.message}</p>
              ))}
              {item.usingOrganizationCalendar && (
                <p className="text-muted-foreground">Uses organization workweek.</p>
              )}
            </div>
          </details>
        ))}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!cursor || feed.loading}
            onClick={() => setCursor(null)}
          >
            First page
          </Button>
          {feed.data?.nextCursor && (
            <Button
              size="sm"
              variant="outline"
              disabled={feed.loading}
              onClick={() => setCursor(feed.data!.nextCursor)}
            >
              Next 200
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
