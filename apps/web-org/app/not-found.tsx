import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm sm:p-9">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles aria-hidden="true" className="size-6" />
        </div>
        <p className="mt-6 font-mono text-xs font-semibold tracking-[0.2em] text-primary">ERROR 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page isn’t here</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          The link may be out of date, or the page may have moved.
        </p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to Smarteam
        </Link>
      </section>
    </main>
  );
}
