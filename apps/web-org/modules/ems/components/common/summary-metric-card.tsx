import type { LucideIcon } from 'lucide-react';

type Tone = 'primary' | 'warning' | 'success' | 'neutral';

const TONES: Record<Tone, { icon: string; value: string; edge: string }> = {
  primary: { icon: 'bg-primary/10 text-primary', value: 'text-foreground', edge: 'border-primary/20' },
  warning: {
    icon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    value: 'text-foreground',
    edge: 'border-amber-500/25',
  },
  success: {
    icon: 'bg-success/10 text-success',
    value: 'text-foreground',
    edge: 'border-emerald-500/25',
  },
  neutral: { icon: 'bg-muted text-muted-foreground', value: 'text-foreground', edge: 'border-border/70' },
};

export function SummaryMetricCard({
  active = false,
  detail,
  icon: Icon,
  label,
  onClick,
  tone = 'neutral',
  value,
}: {
  active?: boolean;
  detail?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  tone?: Tone;
  value: number | string;
}) {
  const colors = TONES[tone];
  const className = `group w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${colors.edge} ${active ? 'ring-1 ring-primary/30' : ''}`;
  const content = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${colors.icon}`}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </span>
      <span className={`mt-3 block font-mono text-2xl font-semibold tabular-nums tracking-tight ${colors.value}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {detail && <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>}
    </>
  );

  return onClick ? (
    <button
      aria-pressed={active}
      className={`${className} cursor-pointer`}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
