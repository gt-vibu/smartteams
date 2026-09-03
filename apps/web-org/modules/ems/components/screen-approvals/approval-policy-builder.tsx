'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@smarteam/ui';
import { approvalDomainLabel, type ApprovalDomain, type ApprovalPolicy } from '@smarteam/contracts';
import { useApprovalPolicies } from '../../hooks/use-approval-policies';
import { ApprovalPolicyDialog } from './approval-policy-dialog';

/**
 * Approval routing rules for the organisation.
 *
 * Replaces a builder backed by `approval-policies.json` and `localStorage`. A policy written
 * there never reached the server, so leave and attendance approvals routed by whatever the
 * backend already held while the screen showed something else entirely.
 *
 * A policy's steps name approvers by role or by user. `MANAGER` steps are not offered: the
 * backend cannot resolve a manager, because a user account is not linked to an employee record —
 * the gap recorded in `docs/backend-gaps.md`.
 */
export function ApprovalPolicyBuilder() {
  const policies = useApprovalPolicies();
  const [editing, setEditing] = useState<ApprovalPolicy | null>(null);
  const [creating, setCreating] = useState(false);

  if (policies.forbidden) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
        <p className="text-sm font-bold text-foreground">Not available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to view approval policies.
        </p>
      </div>
    );
  }

  const byDomain = new Map<ApprovalDomain, ApprovalPolicy[]>();
  for (const policy of policies.policies) {
    byDomain.set(policy.domain, [...(byDomain.get(policy.domain) ?? []), policy]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Each domain routes to its default policy. Steps are approved in order.
        </p>
        {policies.canWrite && (
          <Button onClick={() => setCreating(true)} size="sm" type="button">
            New policy
          </Button>
        )}
      </div>

      {policies.saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {policies.saveError}
        </p>
      )}

      {policies.loading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading approval policies...
        </p>
      )}

      {!policies.loading && policies.error && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
          <p className="text-sm font-bold text-foreground">Could not load approval policies</p>
          <p className="mt-1 text-xs text-muted-foreground">{policies.error}</p>
          <Button
            className="mt-3"
            onClick={() => void policies.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}

      {!policies.loading && !policies.error && policies.policies.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-sm font-bold text-foreground">No approval policies</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave and attendance requests cannot be submitted until a default policy exists for
            their domain.
          </p>
        </div>
      )}

      {[...byDomain.entries()].map(([domain, list]) => (
        <section className="space-y-2" key={domain}>
          <h3 className="text-xs font-bold text-foreground">{approvalDomainLabel[domain]}</h3>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-bold">Policy</th>
                  <th className="px-4 py-2.5 font-bold">Steps</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((policy) => (
                  <tr
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                    key={policy.id}
                  >
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold text-foreground">{policy.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {policy.code}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {policy.steps
                        .map((step) => `${step.stepNumber}. ${step.approverType.toLowerCase()}`)
                        .join('  ·  ')}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {policy.isDefault && <Badge variant="sky">Default</Badge>}
                        <Badge variant={policy.isActive ? 'success' : 'secondary'}>
                          {policy.isActive ? 'Active' : 'Retired'}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {policies.canWrite && policy.isActive && (
                        <Button
                          onClick={() => setEditing(policy)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <ApprovalPolicyDialog
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        open={creating || editing !== null}
        policies={policies}
        policy={editing}
      />
    </div>
  );
}
