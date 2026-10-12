import type { HTMLAttributes, SVGProps } from 'react';
import { cn } from './cn';
export { SMARTEAM_BRAND_PRIMARY } from './theme';

export interface BrandProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
  subtitle?: string;
}

/** The platform mark, shared by navigation and loading states. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 32 32" {...props}>
      <path
        d="M23.5 7.5h-10a6 6 0 0 0 0 12h5a4 4 0 0 1 0 8H8.5M8.5 24.5h10a6 6 0 0 0 0-12h-5a4 4 0 0 1 0-8h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
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
        <BrandMark className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold tracking-tight">Smarteam</span>
        {!compact && <span className="block text-[11px] text-muted-foreground">{subtitle}</span>}
      </span>
    </div>
  );
}
