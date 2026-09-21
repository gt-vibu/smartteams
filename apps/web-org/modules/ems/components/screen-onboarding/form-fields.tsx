'use client';

import React from 'react';
import { Label } from '@smarteam/ui';

/** A titled group of fields in a two-column grid. */
export function Fieldset({ children, legend }: { children: React.ReactNode; legend: string }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {legend}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** A labelled field; `required` adds the red asterisk. */
export function Field({
  children,
  label,
  required,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label className="mb-1 block">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
