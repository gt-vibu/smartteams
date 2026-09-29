'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@smarteam/ui';
import { approvalDomainLabel, type ApprovalDomain, type ApprovalPolicy } from '@smarteam/contracts';
import { useApprovalPolicies } from '../../hooks/use-approval-policies';
import { useRoles } from '../../hooks/use-roles';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { approvalsRepository } from '../../repositories/approvals.repository';
import { ApprovalPolicyDialog } from './approval-policy-dialog';

/**
 * Approval routing rules for the organisation: for each kind of request, the chain of people it
 * passes through. Everything shown is what the server routes by; retired versions stay on record
 * but are hidden until asked for.
 */
export function ApprovalPolicyBuilder() {
  const policies = useApprovalPolicies();
  const roles = useRoles();
  // Who approves each step, in words: the role's name, the person's manager, or a named user.
  const { session } = useSession();
  const people = useAsyncResource(
    () => approvalsRepository.approverCandidates(session!.organizationId),
    [session?.organizationId],
    { enabled: Boolean(session?.organizationId) && policies.canWrite },
  );
  const roleName = (id: string | null | undefined) =>
    roles.roles.find((role) => role.id === id)?.name ?? 'A role';
  const stepLabel = (step: ApprovalPolicy['steps'][number]) =>
    step.approverType === 'MANAGER'
      ? step.roleId
        ? `Reporting manager (or ${roleName(step.roleId)})`
        : 'Reporting manager'
      : step.approverType === 'ROLE'
        ? roleName(step.roleId)
        : (people.data?.find((person) => person.userId === step.approverUserId)?.name ??
          'A named person');
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<ApprovalPolicy | null>(null);
  const [creating, setCreating] = useState(false);

  if (policies.forbidden) {
    return (
      <div
        className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
        role="status"
      >
        <p className="text-sm font-bold text-foreground">Not available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to view approval policies.
        </p>
      </div>
    );
  }

  const byDomain = new Map<ApprovalDomain, ApprovalPolicy[]>();
  const retiredCount = policies.policies.filter((policy) => !policy.isActive).length;
  for (const policy of policies.policies) {
    if (!policy.isActive && !showRetired) continue;
    byDomain.set(policy.domain, [...(byDomain.get(policy.domain) ?? []), policy]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Each kind of request follows its default policy, one step after another.
          {retiredCount > 0 && (
            <button
              className="ml-2 font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => setShowRetired((value) => !value)}
              type="button"
            >
              {showRetired ? 'Hide inactive' : `Show inactive (${retiredCount})`}
            </button>
          )}
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
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="alert"
        >
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
        <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
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
            <table className="stack-table w-full text-left text-xs">
              <thead className="border-b border-border bg-table-header">
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
                    <td data-cell="primary" className="px-4 py-2.5">
                      <span className="block font-semibold text-foreground">{policy.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {policy.code}
                      </span>
                    </td>
                    <td data-label="Steps" className="px-4 py-2.5 text-muted-foreground">
                      {policy.steps
                        .map((step) => `${step.stepNumber}. ${stepLabel(step)}`)
                        .join('  ·  ')}
                    </td>
                    <td data-cell="status" data-label="Status" className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {policy.isDefault && <Badge variant="sky">Default</Badge>}
                        <Badge variant={policy.isActive ? 'success' : 'secondary'}>
                          {policy.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </td>
                    <td data-cell="actions" className="px-4 py-2.5 text-right">
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
