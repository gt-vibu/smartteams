import { Badge, Button } from '@smarteam/ui';
import type { OrganizationSummary } from '../../lib/api-client';

/** One tenant in the companies table. */
export function CompanyRow({
  company,
  deactivating,
  onDeactivate,
}: {
  company: OrganizationSummary;
  deactivating: boolean;
  onDeactivate: (company: OrganizationSummary) => void;
}) {
  const isActive = company.status === 'ACTIVE';

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="py-3.5 px-4 font-medium text-foreground">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
            {company.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-foreground">{company.name}</div>
            <div className="text-[11px] font-mono text-muted-foreground">{company.slug}</div>
          </div>
        </div>
      </td>

      <td className="py-3.5 px-4">
        <Badge
          variant="outline"
          className={
            isActive
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px]'
              : 'bg-destructive/10 text-destructive border-destructive/30 text-[11px]'
          }
        >
          {isActive ? 'Active' : 'Deactivated'}
        </Badge>
      </td>

      <td className="py-3.5 px-4">
        {company.adminUser ? (
          <div>
            <div className="font-medium text-foreground">{company.adminUser.displayName}</div>
            <div className="text-[11px] font-mono text-muted-foreground">
              {company.adminUser.email}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground italic">None</span>
        )}
      </td>

      <td className="py-3.5 px-4">
        <div className="text-foreground">{company.timezone}</div>
        <div className="text-[11px] text-muted-foreground font-mono">{company.currencyCode}</div>
      </td>

      <td className="py-3.5 px-4 text-foreground font-medium">{company.branchCount}</td>

      <td className="py-3.5 px-4 text-muted-foreground">
        {new Date(company.createdAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </td>

      <td className="py-3.5 px-4 text-right">
        {isActive ? (
          <Button
            disabled={deactivating}
            onClick={() => onDeactivate(company)}
            size="sm"
            type="button"
            variant="outline"
            className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
          >
            {deactivating ? 'Deactivating…' : 'Deactivate'}
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}
