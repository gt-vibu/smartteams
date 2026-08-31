import { Checkbox } from '@smarteam/ui';

/** Checkbox with an associated label, wrapped so the whole row is a click target. */
export function CheckField({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm font-medium">
      <Checkbox
        checked={checked}
        className="mt-0.5 size-4 accent-primary"
        disabled={disabled}
        onCheckedChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}
