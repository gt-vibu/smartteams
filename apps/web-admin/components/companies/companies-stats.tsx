import { Card, Icon, type IconName } from '@smarteam/ui';
import type { OrganizationSummary } from '../../lib/api-client';

type Tone = 'neutral' | 'positive' | 'critical' | 'accent';

/**
 * Tone maps to the semantic token palette rather than raw colour names, so these tiles follow
 * the theme in both light and dark mode instead of pinning a specific hue.
 */
const TONES: Record<Tone, { ring: string; icon: string; value: string }> = {
  neutral: {
    ring: 'border-border',
    icon: 'bg-muted text-muted-foreground',
    value: 'text-foreground',
  },
  positive: {
    ring: 'border-success/25',
    icon: 'bg-success/10 text-success',
    value: 'text-success',
  },
  critical: {
    ring: 'border-destructive/25',
    icon: 'bg-destructive/10 text-destructive',
    value: 'text-destructive',
  },
  accent: {
    ring: 'border-primary/25',
    icon: 'bg-primary/10 text-primary',
    value: 'text-primary',
  },
};

function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: number | string;
  icon: IconName;
  tone?: Tone;
  hint?: string;
}) {
  const styles = TONES[tone];
  return (
    <Card className={`flex items-center gap-3 border p-4 shadow-sm ${styles.ring}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${styles.icon}`}>
        <Icon className="size-4" name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={`block text-xl font-bold leading-tight ${styles.value}`}>{value}</span>
        {hint && <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </Card>
  );
}

/** Portfolio summary across all provisioned tenants. */
export function CompaniesStats({ companies }: { companies: OrganizationSummary[] }) {
  const active = companies.filter((company) => company.status === 'ACTIVE').length;
  const deactivated = companies.length - active;
  const people = companies.reduce((total, company) => total + company.userCount, 0);

  // "Recent" is a rolling 30-day window, which is what makes the tile useful at a glance.
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = companies.filter(
    (company) => new Date(company.createdAt).getTime() >= thirtyDaysAgo,
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        hint={recent > 0 ? `${recent} added in 30 days` : undefined}
        icon="building"
        label="Companies"
        tone="accent"
        value={companies.length}
      />
      <StatTile icon="check" label="Active" tone="positive" value={active} />
      <StatTile
        icon="power"
        label="Deactivated"
        tone={deactivated > 0 ? 'critical' : 'neutral'}
        value={deactivated}
      />
      <StatTile icon="users" label="Members" value={people} />
    </div>
  );
}
