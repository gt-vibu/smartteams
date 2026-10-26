'use client';

import { useEffect } from 'react';
import { Button } from '@smarteam/ui';
import { CircleAlert, RotateCcw } from 'lucide-react';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm sm:p-9" role="alert">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <CircleAlert aria-hidden="true" className="size-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">We couldn’t load this page</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Something went wrong while opening this screen. Try again, or return to the workspace.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={retry} type="button"><RotateCcw aria-hidden="true" className="mr-2 size-4" />Try again</Button>
          <Button asChild variant="outline"><a href="/">Back to Smarteam</a></Button>
        </div>
      </section>
    </main>
  );
}
