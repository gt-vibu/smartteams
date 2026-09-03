'use client';

import { Button, Icon } from '@smarteam/ui';

/**
 * The non-content states a profile surface has to render once its data comes from the API.
 *
 * Shared so every profile component shows the same thing, and so no screen is tempted to fill
 * the gap with placeholder records while it waits.
 */
export type ProfileStateProps = {
  loading: boolean;
  error: string | null;
  forbidden: boolean;
  /** False when the signed-in account has no employee record in this tenant. */
  hasEmployeeRecord: boolean;
  /** May be async (a refetch); the handler discards the promise. */
  onRetry?: () => void | Promise<void>;
  className?: string;
};

/** Returns the state element to render, or null when real content should be shown instead. */
export function ProfileState({
  loading,
  error,
  forbidden,
  hasEmployeeRecord,
  onRetry,
  className,
}: ProfileStateProps) {
  const wrapper = `flex flex-col items-center justify-center gap-2 p-6 text-center ${className ?? ''}`;

  if (loading) {
    return (
      <div aria-busy="true" className={wrapper} role="status">
        <span className="h-12 w-12 animate-pulse rounded-full bg-muted" />
        <span className="h-3 w-32 animate-pulse rounded bg-muted" />
        <span className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!hasEmployeeRecord) {
    return (
      <div className={wrapper} role="status">
        <Icon className="size-5 text-muted-foreground" name="users" />
        <p className="text-sm font-semibold text-foreground">No employee profile</p>
        <p className="text-xs text-muted-foreground">
          This account administers the organization but is not an employee of it.
        </p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className={wrapper} role="status">
        <Icon className="size-5 text-muted-foreground" name="lock" />
        <p className="text-sm font-semibold text-foreground">Not available</p>
        <p className="text-xs text-muted-foreground">
          You do not have permission to view this profile.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={wrapper} role="alert">
        <Icon className="size-5 text-destructive" name="warning" />
        <p className="text-sm font-semibold text-foreground">Could not load your profile</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        {onRetry && (
          <Button
            className="mt-1"
            onClick={() => void onRetry()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        )}
      </div>
    );
  }

  return null;
}
