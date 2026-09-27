'use client';

import React, { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { formatDate } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import {
  employeeExtrasRepository,
  type FieldValue,
} from '../../repositories/employee-extras.repository';

/**
 * The organization's own fields on one person's record. HR edits them all; the person edits the
 * ones HR marked as theirs, and sees only those. Nothing is shown when the organization has none.
 */
export function EmployeeCustomFieldsSection({
  employeeId,
  readOnly = false,
}: {
  employeeId: string;
  readOnly?: boolean;
}) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const values = useAsyncResource(
    () => employeeExtrasRepository.values(organizationId!, employeeId),
    [organizationId, employeeId],
    { enabled: Boolean(organizationId) },
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft(Object.fromEntries((values.data ?? []).map((field) => [field.key, field.value])));
  }, [values.data]);

  const fields = values.data ?? [];
  if (values.loading || values.forbidden || fields.length === 0) return null;
  const canEdit = !readOnly && fields.some((field) => field.editable);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const editable = Object.fromEntries(
        fields
          .filter((field) => field.editable)
          .map((field) => [field.key, draft[field.key] ?? '']),
      );
      await employeeExtrasRepository.setValues(organizationId!, employeeId, editable);
      await values.refetch();
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          More details
        </h3>
        {canEdit && !editing && (
          <Button onClick={() => setEditing(true)} size="sm" type="button" variant="ghost">
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <FieldEditor
              busy={busy || !field.editable}
              field={field}
              key={field.key}
              onChange={(value) => setDraft({ ...draft, [field.key]: value })}
              value={draft[field.key] ?? ''}
            />
          ))}
        </div>
      ) : (
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {fields.map((field) => (
            <div className="flex justify-between gap-3" key={field.key}>
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="text-right font-medium text-foreground">
                {(field.fieldType === 'DATE' ? formatDate(field.value) : field.value) || '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {error && (
        <p className="text-[11px] font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <div className="flex justify-end gap-2">
          <Button
            disabled={busy}
            onClick={() => setEditing(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()} size="sm" type="button">
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </section>
  );
}

function FieldEditor({
  field,
  value,
  busy,
  onChange,
}: {
  field: FieldValue;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.key}`;
  return (
    <div>
      <Label className="mb-1 block" htmlFor={id}>
        {field.label}
        {field.required ? ' *' : ''}
      </Label>
      {field.fieldType === 'SELECT' ? (
        <SelectMenu disabled={busy} onValueChange={onChange} value={value}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectMenu>
      ) : field.fieldType === 'DATE' ? (
        <DatePicker disabled={busy} id={id} onChange={onChange} value={value} />
      ) : (
        <Input
          disabled={busy}
          id={id}
          inputMode={field.fieldType === 'NUMBER' ? 'decimal' : undefined}
          onChange={(event) => onChange(event.target.value)}
          type={field.fieldType === 'NUMBER' ? 'number' : 'text'}
          value={value}
        />
      )}
    </div>
  );
}
