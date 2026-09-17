import { Button, Icon } from '@smarteam/ui';

const COLUMN_COUNT = 7;

/** Placeholder row shown while the tenant list is loading. */
export function CompaniesLoadingRow() {
  return (
    <tr>
      <td colSpan={COLUMN_COUNT} className="py-12 text-center text-muted-foreground">
        <div className="flex items-center justify-center gap-2">
          <Icon className="size-4 animate-spin text-primary" name="refresh" />
          <span>Loading…</span>
        </div>
      </td>
    </tr>
  );
}

/**
 * Empty state. Distinguishes "no tenants exist yet" from "the current search matched nothing",
 * because only the first is worth offering the create action for.
 */
export function CompaniesEmptyRow({ searching, onAdd }: { searching: boolean; onAdd: () => void }) {
  return (
    <tr>
      <td colSpan={COLUMN_COUNT} className="py-12 text-center text-muted-foreground">
        <div className="max-w-sm mx-auto space-y-2">
          <div className="size-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <Icon className="size-5" name="building" />
          </div>
          <p className="font-semibold text-foreground">
            {searching ? 'No matches' : 'No companies yet'}
          </p>
          {!searching && (
            <Button onClick={onAdd} size="sm" className="mt-3">
              <Icon className="size-4" name="plus" />
              <span>Add Company</span>
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
