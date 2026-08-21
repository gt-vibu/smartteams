import { Icon } from '@smarteam/ui';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Icon className="size-5" name="spark" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold tracking-tight">Smarteam</span>
        {!compact && (
          <span className="block text-[11px] text-muted-foreground">Platform operations</span>
        )}
      </span>
    </div>
  );
}
