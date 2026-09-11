'use client';

import React, { useEffect, useState } from 'react';
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

/**
 * Creates or edits one approval policy.
 *
 * A step routes either to a role or to the requester's reporting manager. Manager routing is fully
 * resolved server-side — `assertResolvableApprovers` follows the requester's `managerEmployeeId`
 * to the manager's active user account and refuses self-approval — so it is offered here.
 *
 * (An earlier pass omitted manager steps on the assumption that user-to-employee linkage was
 * missing. `Employee.userId` is a unique column and the resolution already existed; the omission
 * was wrong and is corrected here.)
 *
 * `USER` steps are not offered: they name a specific approver account, which needs a user picker
 * this module does not have.
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
  const roles = useRoles();
  const [domain, setDomain] = useState<ApprovalDomain>('LEAVE');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  // A step is either a role id or the literal manager routing marker.
  const MANAGER_STEP = 'MANAGER';
  const [roleIds, setRoleIds] = useState<string[]>(['']);

  useEffect(() => {
    if (!open) return;
    setDomain(policy?.domain ?? 'LEAVE');
    setCode(policy?.code ?? '');
    setName(policy?.name ?? '');
    setIsDefault(policy?.isDefault ?? true);
    setRoleIds(
      policy && policy.steps.length > 0
        ? policy.steps.map((step) =>
            step.approverType === 'MANAGER' ? MANAGER_STEP : (step.roleId ?? ''),
          )
        : [''],
    );
  }, [open, policy]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const steps = roleIds
      .filter((entry) => entry)
      .map((entry, index) =>
        entry === MANAGER_STEP
          ? { stepNumber: index + 1, approverType: 'MANAGER' as const }
          : { stepNumber: index + 1, approverType: 'ROLE' as const, roleId: entry },
      );
    if (!code.trim() || !name.trim() || steps.length === 0) return;
    const input = { domain, code: code.trim(), name: name.trim(), isDefault, steps };
    const ok = policy
      ? await policies.updatePolicy(policy.id, {
          code: input.code,
          name: input.name,
          isDefault,
          steps,
        })
      : await policies.createPolicy(input);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{policy ? 'Edit approval policy' : 'New approval policy'}</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          {!policy && (
            <div>
              <Label className="mb-1 block">Domain</Label>
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
              <Label className="mb-1 block" htmlFor="policy-code">
                Code
              </Label>
              <Input
                disabled={policies.saving}
                id="policy-code"
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="policy-name">
                Name
              </Label>
              <Input
                disabled={policies.saving}
                id="policy-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-foreground">Approval steps</legend>
            {roles.forbidden && (
              <p className="text-[11px] text-muted-foreground">
                Roles cannot be listed with your permissions, so steps cannot be chosen.
              </p>
            )}
            {roleIds.map((roleId, index) => (
              <div className="flex items-center gap-2" key={index}>
                <span className="w-5 text-[11px] text-muted-foreground">{index + 1}.</span>
                <SelectMenu
                  onValueChange={(value) =>
                    setRoleIds(roleIds.map((entry, i) => (i === index ? value : entry)))
                  }
                  value={roleId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an approver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MANAGER_STEP}>The requester&apos;s manager</SelectItem>
                    {roles.roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
                {roleIds.length > 1 && (
                  <Button
                    onClick={() => setRoleIds(roleIds.filter((_, i) => i !== index))}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button
              onClick={() => setRoleIds([...roleIds, ''])}
              size="sm"
              type="button"
              variant="outline"
            >
              Add step
            </Button>
          </fieldset>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              checked={isDefault}
              disabled={policies.saving}
              onChange={(event) => setIsDefault(event.target.checked)}
              type="checkbox"
            />
            Use as the default policy for this domain
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
            <Button disabled={policies.saving} type="submit">
              {policies.saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
