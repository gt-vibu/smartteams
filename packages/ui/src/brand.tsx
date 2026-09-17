import type { HTMLAttributes } from 'react';
import { cn } from './cn';
import { Icon } from './icons';
export { SMARTEAM_BRAND_PRIMARY } from './theme';

export interface BrandProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
  subtitle?: string;
}

export function Brand({
  compact = false,
  subtitle = 'Platform operations',
  className,
  ...props
}: BrandProps) {
  return (
    <div className={cn('flex items-center gap-3', className)} {...props}>
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Icon className="size-5" name="spark" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold tracking-tight">Smarteam</span>
        {!compact && <span className="block text-[11px] text-muted-foreground">{subtitle}</span>}
      </span>
    </div>
  );
}
