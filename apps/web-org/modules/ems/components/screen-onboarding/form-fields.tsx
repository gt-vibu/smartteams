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

/**
 * A labelled field; `required` adds the red asterisk.
 *
 * The label wraps its control, which is what ties the two together: a screen reader names the box
 * by it and a click on the words focuses the box. They were siblings, so every field here was
 * announced as an unnamed text box.
 */
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
      <Label className="block">
        <span className="mb-1 block">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-destructive">
              *
            </span>
          )}
        </span>
        <span className="block font-normal">{children}</span>
      </Label>
    </div>
  );
}
