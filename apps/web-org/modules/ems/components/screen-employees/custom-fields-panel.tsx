'use client';

import React, { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
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
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import {
  employeeExtrasRepository,
  type FieldDefinition,
  type FieldInput,
  type FieldType,
} from '../../repositories/employee-extras.repository';

const TYPE_LABEL: Record<FieldType, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  DATE: 'Date',
  SELECT: 'Choice from a list',
};
const EMPTY: FieldInput = {
  label: '',
  fieldType: 'TEXT',
  options: [],
  required: false,
  employeeEditable: false,
};

/**
 * The fields the organization adds to every employee record. Each appears on profiles as soon as
 * it is added; switching one off hides it without losing what was recorded.
 */
export function CustomFieldsPanel() {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const list = useAsyncResource(
    () => employeeExtrasRepository.definitions(organizationId!, true),
    [organizationId],
    { enabled: Boolean(organizationId) },
  );
  const [editing, setEditing] = useState<FieldDefinition | 'new' | null>(null);
  const [form, setForm] = useState<FieldInput>(EMPTY);
  const [optionsText, setOptionsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = (field: FieldDefinition | 'new') => {
    setEditing(field);
    setForm(field === 'new' ? EMPTY : { ...field });
    setOptionsText(field === 'new' ? '' : field.options.join(', '));
    setError('');
  };

  const save = async (patch: Partial<FieldInput> = {}, target = editing) => {
    if (!target) return;
    const input = {
      ...form,
      ...patch,
      options: optionsText
        .split(',')
        .map((option) => option.trim())
        .filter(Boolean),
    };
    setBusy(true);
    setError('');
    try {
      if (target === 'new') await employeeExtrasRepository.createDefinition(organizationId!, input);
      else await employeeExtrasRepository.updateDefinition(organizationId!, target.id, input);
      await list.refetch();
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Fields your organization keeps on everyone: a blood group, a T-shirt size, a vehicle
          number.
        </p>
        <Button onClick={() => open('new')} size="sm" type="button">
          Add field
        </Button>
      </div>
      {(list.data ?? []).length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground">
          No fields yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {(list.data ?? []).map((field) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              key={field.id}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  {field.label}
                  {!field.isActive && <Badge variant="secondary">Off</Badge>}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {TYPE_LABEL[field.fieldType]}
                  {field.fieldType === 'SELECT' ? `: ${field.options.join(', ')}` : ''}
                  {field.required ? ' · required' : ''}
                  {field.employeeEditable ? ' · employees fill it in' : ' · kept by HR'}
                </span>
              </span>
              <Button onClick={() => open(field)} size="sm" type="button" variant="ghost">
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog onOpenChange={(next) => !next && !busy && setEditing(null)} open={editing !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{editing === 'new' ? 'Add a field' : 'Edit field'}</DialogTitle>
          <div className="mt-3 space-y-3">
            <div>
              <Label className="mb-1 block" htmlFor="field-label">
                Name
              </Label>
              <Input
                disabled={busy}
                id="field-label"
                maxLength={60}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                placeholder="Blood group"
                value={form.label}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="field-type">
                Kind
              </Label>
              <SelectMenu
                disabled={busy}
                onValueChange={(value) => setForm({ ...form, fieldType: value as FieldType })}
                value={form.fieldType}
              >
                <SelectTrigger id="field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL) as FieldType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </div>
            {form.fieldType === 'SELECT' && (
              <div>
                <Label className="mb-1 block" htmlFor="field-options">
                  Choices, separated by commas
                </Label>
                <Input
                  disabled={busy}
                  id="field-options"
                  onChange={(event) => setOptionsText(event.target.value)}
                  placeholder="A+, A-, B+, B-, O+, O-, AB+, AB-"
                  value={optionsText}
                />
              </div>
            )}
            {(
              [
                ['required', 'Required'],
                ['employeeEditable', 'Employees see and fill it in themselves'],
              ] as const
            ).map(([key, label]) => (
              <label className="flex items-center gap-2 text-xs text-foreground" key={key}>
                <Checkbox
                  checked={form[key]}
                  disabled={busy}
                  onCheckedChange={(checked) => setForm({ ...form, [key]: checked === true })}
                />
                {label}
              </label>
            ))}
            {error && (
              <p className="text-[11px] font-semibold text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {editing !== 'new' && editing && (
                <Button
                  disabled={busy}
                  onClick={() => void save({ isActive: !editing.isActive })}
                  type="button"
                  variant="outline"
                >
                  {editing.isActive ? 'Switch off' : 'Switch on'}
                </Button>
              )}
              <Button
                disabled={busy || !form.label.trim()}
                onClick={() => void save()}
                type="button"
              >
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
