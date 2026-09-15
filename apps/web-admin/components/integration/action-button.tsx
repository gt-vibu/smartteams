import { Button, Icon } from '@smarteam/ui';

/** Square icon-only button used in table row action columns. */
export function ActionButton({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: 'edit' | 'refresh' | 'power' | 'trash';
  label: string;
  danger?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className={`grid size-10 place-items-center rounded-lg border border-border transition-colors disabled:cursor-wait disabled:opacity-45 ${
        danger
          ? 'text-destructive hover:border-destructive/30 hover:bg-destructive/5'
          : 'hover:bg-muted'
      }`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="size-4" name={icon} />
    </Button>
  );
}
