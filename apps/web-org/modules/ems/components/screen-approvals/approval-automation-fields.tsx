'use client';
import type { ApprovalAutomation, ApprovalDomain } from '@smarteam/contracts';
import {
  DatePicker,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { ApprovalAutomationPreview } from './approval-automation-preview';
import { ApprovalAutomationScope } from './approval-automation-scope';

export function ApprovalAutomationFields({
  value,
  onChange,
  domain,
  disabled,
}: {
  value: ApprovalAutomation;
  onChange: (value: ApprovalAutomation) => void;
  domain: ApprovalDomain;
  disabled: boolean;
}) {
  if (domain !== 'LEAVE' && domain !== 'ATTENDANCE_CORRECTION') return null;
  const fields: Array<{
    key:
      | 'maxLeaveDays'
      | 'minNoticeDays'
      | 'maxCorrectionAgeDays'
      | 'maxChangedMinutes'
      | 'maxCorrectionsPerMonth';
    label: string;
    max: number;
    min: number;
  }> =
    domain === 'LEAVE'
      ? [
          { key: 'maxLeaveDays', label: 'Maximum leave days', min: 1, max: 366 },
          { key: 'minNoticeDays', label: 'Minimum advance notice (days)', min: 0, max: 365 },
        ]
      : [
          { key: 'maxCorrectionAgeDays', label: 'Maximum correction age (days)', min: 0, max: 90 },
          { key: 'maxChangedMinutes', label: 'Maximum punch change (minutes)', min: 0, max: 120 },
          {
            key: 'maxCorrectionsPerMonth',
            label: 'Maximum corrections per month',
            min: 1,
            max: 31,
          },
        ];
  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <Label htmlFor="approval-mode">Approval mode</Label>
      <SelectMenu
        value={value.mode}
        disabled={disabled}
        onValueChange={(mode) => onChange({ ...value, mode: mode as ApprovalAutomation['mode'] })}
      >
        <SelectTrigger id="approval-mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="MANUAL">Manual approval</SelectItem>
          <SelectItem value="AUTOMATIC">Automatic approval</SelectItem>
          <SelectItem value="CONDITIONAL">Conditional automatic approval</SelectItem>
        </SelectContent>
      </SelectMenu>
      <p className="text-xs text-muted-foreground">
        {value.mode === 'MANUAL'
          ? 'Requests follow the approval stages below.'
          : 'Valid requests matching these settings are approved by the system. Exceptions follow the approval stages below. Changes apply to new requests.'}
      </p>
      {value.mode !== 'MANUAL' && (
        <>
          <ApprovalAutomationScope
            value={value}
            domain={domain}
            disabled={disabled}
            onChange={onChange}
          />
          <ApprovalAutomationPreview value={value} domain={domain} disabled={disabled} />
          <Label htmlFor="automation-effective">Effective from (optional)</Label>
          <DatePicker
            id="automation-effective"
            disabled={disabled}
            value={value.effectiveOn ?? ''}
            onChange={(effectiveOn) =>
              onChange({ ...value, effectiveOn: effectiveOn || undefined })
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key}>
                <Label htmlFor={`automation-${field.key}`}>{field.label}</Label>
                <Input
                  id={`automation-${field.key}`}
                  type="number"
                  min={field.min}
                  max={field.max}
                  disabled={disabled}
                  value={value[field.key] ?? ''}
                  placeholder="No additional limit"
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [field.key]:
                        event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {domain === 'ATTENDANCE_CORRECTION'
              ? 'Missing punches, non-working days, and overtime require review. Conditional mode requires both age and change limits.'
              : 'Conditional mode requires a maximum number of days. Balances, overlapping dates, and documents are always checked.'}
          </p>
        </>
      )}
    </section>
  );
}
