'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

type Feedback = { id: number; tone: 'success' | 'error'; message: string };

/** App-wide, branded feedback for completed and failed server mutations. */
export function FeedbackToasts() {
  const [items, setItems] = useState<Feedback[]>([]);

  useEffect(() => {
    let nextId = 0;
    const onFeedback = (event: Event) => {
      const detail = (event as CustomEvent<{ tone?: string; message?: string }>).detail;
      if (!detail.message || (detail.tone !== 'success' && detail.tone !== 'error')) return;
      const item: Feedback = { id: ++nextId, tone: detail.tone, message: detail.message };
      setItems((current) => [...current.slice(-2), item]);
      window.setTimeout(() => setItems((current) => current.filter((entry) => entry.id !== item.id)), 5000);
    };
    window.addEventListener('ems:feedback', onFeedback);
    return () => window.removeEventListener('ems:feedback', onFeedback);
  }, []);

  return (
    <div aria-label="Notifications" className="pointer-events-none fixed right-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[70] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5" aria-live="polite">
      {items.map((item) => {
        const Icon = item.tone === 'success' ? CheckCircle2 : CircleAlert;
        return (
          <div key={item.id} role={item.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card px-3.5 py-3 text-sm shadow-lg ${item.tone === 'success' ? 'border-success/30 text-foreground' : 'border-destructive/30 text-foreground'}`}>
            <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${item.tone === 'success' ? 'text-success' : 'text-destructive'}`} />
            <span className="min-w-0 flex-1 break-words">{item.message}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
