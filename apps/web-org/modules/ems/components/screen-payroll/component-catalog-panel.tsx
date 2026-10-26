'use client';

import React, { useState } from 'react';
import {
  Badge,
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
import type { PayComponentDefinition } from '@smarteam/contracts';
import type { CompensationState } from '../../hooks/use-compensation';

/**
 * The organisation's pay-component catalogue.
 *
 * A component is *configuration*: its type and calculation basis decide how payroll prices it.
 * The amount an employee receives is not set here — that belongs to the assignment — and no
 * figure on this panel is calculated by the browser.
 *
 * The API has no native route to edit or retire a component, so neither is offered.
 */

const typeLabel: Record<string, string> = {
  EARNING: 'Earning',
  DEDUCTION: 'Deduction',
  EMPLOYER_CONTRIBUTION: 'Employer contribution',
};

const basisLabel: Record<string, string> = {
  FIXED: 'Fixed amount',
  PERCENTAGE_OF_BASE: 'Percentage of base',
  FORMULA: 'Formula',
};

export function ComponentCatalogPanel({ compensation }: { compensation: CompensationState }) {
  const [creating, setCreating] = useState(false);

  if (compensation.componentsForbidden) {
    return (
      <div
        className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
        role="status"
      >
        <p className="text-sm font-bold text-foreground">Not available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You do not have permission to view pay components.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Components payroll can price. Assign one to an employee to give it a value.
        </p>
        {compensation.can.createComponent && (
          <Button onClick={() => setCreating(true)} size="sm" type="button">
            New component
          </Button>
        )}
      </div>

      {compensation.componentsLoading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading components...
        </p>
      )}

      {!compensation.componentsLoading && compensation.componentsError && (
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="alert"
        >
          <p className="text-sm font-bold text-foreground">Could not load pay components</p>
          <p className="mt-1 text-xs text-muted-foreground">{compensation.componentsError}</p>
        </div>
      )}

      {!compensation.componentsLoading &&
        !compensation.componentsError &&
        (compensation.components.length === 0 ? (
          <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
            <p className="text-sm font-bold text-foreground">No pay components</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Payroll still pays base, HRA and other allowance, which are derived from the payroll
              policy rather than from components.
            </p>
          </div>
        ) : (
          <ComponentTable components={compensation.components} />
        ))}

      <CreateComponentDialog
        compensation={compensation}
        onOpenChange={setCreating}
        open={creating}
      />
    </div>
  );
}

function ComponentTable({ components }: { components: PayComponentDefinition[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="stack-table w-full min-w-[680px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">Code</th>
            <th className="px-4 py-2.5 font-bold">Name</th>
            <th className="px-4 py-2.5 font-bold">Type</th>
            <th className="px-4 py-2.5 font-bold">Basis</th>
            <th className="px-4 py-2.5 font-bold">Taxable</th>
          </tr>
        </thead>
        <tbody>
          {components.map((component) => (
            <tr
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              key={component.id}
            >
              <td data-label="Code" className="px-4 py-2.5 font-mono font-semibold text-foreground">
                {component.code}
              </td>
              <td data-cell="primary" className="px-4 py-2.5 text-foreground">
                {component.name}
              </td>
              <td data-label="Type" className="px-4 py-2.5 text-muted-foreground">
                {typeLabel[component.componentType] ?? component.componentType}
              </td>
              <td data-label="Basis" className="px-4 py-2.5 text-muted-foreground">
                {basisLabel[component.calculationType] ?? component.calculationType}
              </td>
              <td data-label="Taxable" className="px-4 py-2.5">
                <Badge variant={component.isTaxable ? 'secondary' : 'outline'}>
                  {component.isTaxable ? 'Taxable' : 'Not taxable'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateComponentDialog({
  compensation,
  open,
  onOpenChange,
}: {
  compensation: CompensationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [componentType, setComponentType] = useState<
    'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION'
  >('EARNING');
  const [calculationType, setCalculationType] = useState<'FIXED' | 'PERCENTAGE_OF_BASE'>('FIXED');
  const [isTaxable, setIsTaxable] = useState(true);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !name.trim()) return;
    const ok = await compensation.createComponent({
      code: code.trim(),
      name: name.trim(),
      componentType,
      calculationType,
      isTaxable,
    });
    if (ok) {
      setCode('');
      setName('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>New pay component</DialogTitle>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="component-code">
                Code
              </Label>
              <Input
                disabled={compensation.saving}
                id="component-code"
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="component-name">
                Name
              </Label>
              <Input
                disabled={compensation.saving}
                id="component-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block">Type</Label>
              <SelectMenu
                onValueChange={(value) =>
                  setComponentType(value as 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION')
                }
                value={componentType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EARNING">Earning</SelectItem>
                  <SelectItem value="DEDUCTION">Deduction</SelectItem>
                  <SelectItem value="EMPLOYER_CONTRIBUTION">Employer contribution</SelectItem>
                </SelectContent>
              </SelectMenu>
            </div>
            <div>
              <Label className="mb-1 block">Basis</Label>
              <SelectMenu
                onValueChange={(value) =>
                  setCalculationType(value as 'FIXED' | 'PERCENTAGE_OF_BASE')
                }
                value={calculationType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed amount</SelectItem>
                  <SelectItem value="PERCENTAGE_OF_BASE">Percentage of base</SelectItem>
                </SelectContent>
              </SelectMenu>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              checked={isTaxable}
              disabled={compensation.saving}
              onChange={(event) => setIsTaxable(event.target.checked)}
              type="checkbox"
            />
            Taxable
          </label>
          {compensation.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {compensation.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={compensation.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={compensation.saving} type="submit">
              {compensation.saving ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
