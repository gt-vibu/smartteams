'use client';

import React from 'react';

/**
 * The frame every signed-out screen shares: a centred card that scrolls with the keyboard up on a
 * phone and respects the device's safe areas.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative flex h-dvh flex-col items-center overflow-y-auto overflow-x-hidden bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>
      <main className="relative my-auto w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          <div className="mt-5">{children}</div>
        </div>
        <div className="mt-5 text-center">
          {footer}
          <p className="mt-2 text-[11px] text-muted-foreground">Smarteam EMS · v0.1.0</p>
        </div>
      </main>
    </div>
  );
}

/** A refusal or failure, stated plainly inside a form. */
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}

export const errorMessage = (caught: unknown, fallback: string) =>
  caught instanceof Error && caught.message ? caught.message : fallback;
