'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { approvalDomainLabel, type ApprovalDomain, type ApprovalPolicy } from '@smarteam/contracts';
import type { ApprovalPolicyState } from '../../hooks/use-approval-policies';
import { useRoles } from '../../hooks/use-roles';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { approvalsRepository } from '../../repositories/approvals.repository';
import {
  ApprovalStepRow,
  draftsFrom,
  emptyStep,
  stepsFrom,
  type StepDraft,
} from './approval-step-editor';

/**
 * Creates or edits one approval policy: the chain of people a request passes through, in order.
 *
 * Each step is the requester's reporting manager (with a backup role for anyone who has none),
 * anyone holding a role, or one named person. Editing a policy that has already routed requests
 * starts a new version on the server; the requests already waiting finish on the old steps.
 */
export function ApprovalPolicyDialog({
  policies,
  policy,
  open,
  onOpenChange,
}: {
  policies: ApprovalPolicyState;
  policy: ApprovalPolicy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const roles = useRoles();
  const people = useAsyncResource(
    () => approvalsRepository.approverCandidates(organizationId!),
    [organizationId],
    { enabled: open && Boolean(organizationId) },
  );
  const roleId = (code: string) => roles.roles.find((role) => role.code === code)?.id ?? '';
  const adminRoleId = roleId('ORG_ADMIN');

  const [domain, setDomain] = useState<ApprovalDomain>('LEAVE');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);

  useEffect(() => {
    if (!open) return;
    setDomain(policy?.domain ?? 'LEAVE');
    setCode(policy?.code ?? '');
    setName(policy?.name ?? '');
    setIsDefault(policy?.isDefault ?? true);
    setSteps(draftsFrom(policy, adminRoleId));
  }, [open, policy, adminRoleId]);

  // Common chains in one click; each is only offered when the roles it needs exist.
  const presets = useMemo(() => {
    const admin = roleId('ORG_ADMIN');
    const hr = roleId('HR_ADMIN');
    const list: Array<{ label: string; steps: StepDraft[] }> = [];
    if (admin)
      list.push({
        label: 'Reporting manager',
        steps: [{ kind: 'MANAGER', roleId: admin, userId: '' }],
      });
    if (admin && hr)
      list.push({
        label: 'Manager, then HR',
        steps: [
          { kind: 'MANAGER', roleId: admin, userId: '' },
          { kind: 'ROLE', roleId: hr, userId: '' },
        ],
      });
    if (hr) list.push({ label: 'HR only', steps: [{ kind: 'ROLE', roleId: hr, userId: '' }] });
    if (admin)
      list.push({ label: 'Admin only', steps: [{ kind: 'ROLE', roleId: admin, userId: '' }] });
    return list;
  }, [roles.roles]);

  const ready = stepsFrom(steps);
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved!);
    setSteps(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !name.trim() || !ready) return;
    const ok = policy
      ? await policies.updatePolicy(policy.id, {
          code: code.trim(),
          name: name.trim(),
          isDefault,
          steps: ready,
        })
      : await policies.createPolicy({
          domain,
          code: code.trim(),
          name: name.trim(),
          isDefault,
          steps: ready,
        });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>{policy ? 'Edit approval policy' : 'New approval policy'}</DialogTitle>
        <form className="mt-4 space-y-4" onSubmit={submit}>
          {!policy && (
            <div>
              <Label className="mb-1 block">Applies to</Label>
              <SelectMenu
                onValueChange={(value) => setDomain(value as ApprovalDomain)}
                value={domain}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(approvalDomainLabel) as ApprovalDomain[]).map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {approvalDomainLabel[entry]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="policy-name">
                Name
              </Label>
              <Input
                disabled={policies.saving}
                id="policy-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Leave approval"
                value={name}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="policy-code">
                Code
              </Label>
              <Input
                disabled={policies.saving}
                id="policy-code"
                onChange={(event) => setCode(event.target.value)}
                placeholder="LEAVE_STANDARD"
                value={code}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-foreground">
              Who approves, in order
            </legend>
            {roles.forbidden ? (
              <p className="text-[11px] text-muted-foreground">
                Roles cannot be listed with your permissions, so steps cannot be chosen.
              </p>
            ) : (
              presets.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Start from:</span>
                  {presets.map((preset) => (
                    <Button
                      disabled={policies.saving}
                      key={preset.label}
                      onClick={() => setSteps(preset.steps)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              )
            )}
            {steps.map((step, index) => (
              <ApprovalStepRow
                count={steps.length}
                disabled={policies.saving}
                index={index}
                key={index}
                onChange={(next) => setSteps(steps.map((s, i) => (i === index ? next : s)))}
                onMove={(by) => move(index, by)}
                onRemove={() => setSteps(steps.filter((_, i) => i !== index))}
                people={people.data ?? []}
                roles={roles.roles}
                step={step}
              />
            ))}
            <Button
              disabled={policies.saving || steps.length >= 5}
              onClick={() => setSteps([...steps, { ...emptyStep(), kind: 'ROLE' }])}
              size="sm"
              type="button"
              variant="outline"
            >
              Add a step
            </Button>
            <p className="text-[11px] text-muted-foreground">
              A request moves to the next step once the current one approves it; a rejection at any
              step ends it.
              {policy && ' Requests already waiting keep the steps they started with.'}
            </p>
          </fieldset>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              checked={isDefault}
              disabled={policies.saving}
              onChange={(event) => setIsDefault(event.target.checked)}
              type="checkbox"
            />
            Use for every new {approvalDomainLabel[policy?.domain ?? domain].toLowerCase()} request
          </label>

          {policies.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {policies.saveError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              disabled={policies.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={policies.saving || !ready || !code.trim() || !name.trim()}
              type="submit"
            >
              {policies.saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
