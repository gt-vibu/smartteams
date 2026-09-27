'use client';

import React from 'react';
import {
  Button,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import type { ApprovalPolicy } from '@smarteam/contracts';
import type { ApproverCandidate } from '../../repositories/approvals.repository';

/**
 * One approval step as the editor holds it.
 *
 * `MANAGER` is the requester's reporting manager; its `roleId` is the backup role that decides
 * when the requester has no active manager (empty means the request cannot be raised). `ROLE` is
 * anyone holding a role, `USER` one named person.
 */
export type StepDraft = { kind: 'MANAGER' | 'ROLE' | 'USER'; roleId: string; userId: string };

export const emptyStep = (): StepDraft => ({ kind: 'MANAGER', roleId: '', userId: '' });

export function draftsFrom(policy: ApprovalPolicy | null, fallbackRoleId: string): StepDraft[] {
  if (!policy || policy.steps.length === 0)
    return [{ kind: 'MANAGER', roleId: fallbackRoleId, userId: '' }];
  return policy.steps.map((step) => ({
    kind: step.approverType === 'USER' ? 'USER' : step.approverType === 'ROLE' ? 'ROLE' : 'MANAGER',
    roleId: step.roleId ?? '',
    userId: step.approverUserId ?? '',
  }));
}

/** What the API takes, or null while a step is still missing its approver. */
export function stepsFrom(drafts: readonly StepDraft[]) {
  const steps = drafts.map((draft, index) => {
    const stepNumber = index + 1;
    if (draft.kind === 'USER')
      return draft.userId
        ? { stepNumber, approverType: 'USER' as const, approverUserId: draft.userId }
        : null;
    if (draft.kind === 'ROLE')
      return draft.roleId
        ? { stepNumber, approverType: 'ROLE' as const, roleId: draft.roleId }
        : null;
    return {
      stepNumber,
      approverType: 'MANAGER' as const,
      ...(draft.roleId ? { roleId: draft.roleId } : {}),
    };
  });
  return steps.every(Boolean) ? (steps as NonNullable<(typeof steps)[number]>[]) : null;
}

type Option = { id: string; name: string };

export function ApprovalStepRow({
  step,
  index,
  count,
  roles,
  people,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  step: StepDraft;
  index: number;
  count: number;
  roles: readonly Option[];
  people: readonly ApproverCandidate[];
  disabled: boolean;
  onChange: (next: StepDraft) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const NONE = '__none__';
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted-foreground">Step {index + 1}</span>
        <div className="ml-auto flex gap-1">
          <Button
            aria-label={`Move step ${index + 1} up`}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
            size="sm"
            type="button"
            variant="ghost"
          >
            ↑
          </Button>
          <Button
            aria-label={`Move step ${index + 1} down`}
            disabled={disabled || index === count - 1}
            onClick={() => onMove(1)}
            size="sm"
            type="button"
            variant="ghost"
          >
            ↓
          </Button>
          {count > 1 && (
            <Button disabled={disabled} onClick={onRemove} size="sm" type="button" variant="ghost">
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <SelectMenu
          disabled={disabled}
          onValueChange={(value) =>
            onChange({ kind: value as StepDraft['kind'], roleId: '', userId: '' })
          }
          value={step.kind}
        >
          <SelectTrigger aria-label={`Step ${index + 1} approver`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MANAGER">Reporting manager</SelectItem>
            <SelectItem value="ROLE">Anyone with a role</SelectItem>
            <SelectItem value="USER">A specific person</SelectItem>
          </SelectContent>
        </SelectMenu>

        {step.kind === 'ROLE' && (
          <SelectMenu
            disabled={disabled}
            onValueChange={(roleId) => onChange({ ...step, roleId })}
            value={step.roleId}
          >
            <SelectTrigger aria-label={`Step ${index + 1} role`}>
              <SelectValue placeholder="Choose a role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectMenu>
        )}

        {step.kind === 'USER' && (
          <SelectMenu
            disabled={disabled}
            onValueChange={(userId) => onChange({ ...step, userId })}
            value={step.userId}
          >
            <SelectTrigger aria-label={`Step ${index + 1} person`}>
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {people.map((person) => (
                <SelectItem key={person.userId} value={person.userId}>
                  {person.name} · {person.employeeNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectMenu>
        )}

        {step.kind === 'MANAGER' && (
          <SelectMenu
            disabled={disabled}
            onValueChange={(value) => onChange({ ...step, roleId: value === NONE ? '' : value })}
            value={step.roleId || NONE}
          >
            <SelectTrigger aria-label={`Step ${index + 1} backup`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No backup: refuse if no manager</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  Backup: {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectMenu>
        )}
      </div>
    </div>
  );
}
