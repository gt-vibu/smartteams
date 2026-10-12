'use client';
import type { ApprovalAutomation, ApprovalDomain } from '@smarteam/contracts';
import { LoadingIndicator, Checkbox, Label } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { leaveRepository } from '../../repositories/leave.repository';
import { organizationRepository } from '../../repositories/organization.repository';

export function ApprovalAutomationScope({
  value,
  domain,
  disabled,
  onChange,
}: {
  value: ApprovalAutomation;
  domain: ApprovalDomain;
  disabled: boolean;
  onChange: (value: ApprovalAutomation) => void;
}) {
  const { session } = useSession();
  const organizationId = session?.organizationId;
  const branches = useAsyncResource(
    () => organizationRepository.listBranches(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) },
  );
  const types = useAsyncResource(
    () => leaveRepository.listTypes(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && domain === 'LEAVE' },
  );
  const toggle = (key: 'branchIds' | 'leaveTypeIds', id: string) =>
    onChange({
      ...value,
      [key]: value[key].includes(id)
        ? value[key].filter((item) => item !== id)
        : [...value[key], id],
    });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Leave all unchecked to cover every branch or leave type. Requests outside this scope follow
        manual approval.
      </p>
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="text-xs font-medium">Branches</legend>
        {branches.error && (
          <p role="alert" className="text-xs text-destructive">
            {branches.error}
          </p>
        )}
        {branches.loading && <LoadingIndicator variant="inline" label="Loading branches" className="text-xs" />}
        {branches.data?.map((branch) => (
          <Label key={branch.id} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={value.branchIds.includes(branch.id)}
              onCheckedChange={() => toggle('branchIds', branch.id)}
            />
            {branch.name}
          </Label>
        ))}
      </fieldset>
      {domain === 'LEAVE' && (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="text-xs font-medium">Leave types</legend>
          {types.error && (
            <p role="alert" className="text-xs text-destructive">
              {types.error}
            </p>
          )}
          {types.data
            ?.filter((type) => type.isActive)
            .map((type) => (
              <Label key={type.id} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={value.leaveTypeIds.includes(type.id)}
                  onCheckedChange={() => toggle('leaveTypeIds', type.id)}
                />
                {type.name}
              </Label>
            ))}
        </fieldset>
      )}
    </div>
  );
}
