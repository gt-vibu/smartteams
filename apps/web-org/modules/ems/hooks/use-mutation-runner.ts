'use client';

import { useCallback, useState } from 'react';

/**
 * Runs a mutation, then refetches.
 *
 * Every reconciled module had its own copy of this. Extracted before the remaining modules are
 * wired, because the two behaviours it encodes are easy to get subtly wrong and expensive when
 * they are:
 *
 *  - The refetch happens on failure as well as success, so a partially-applied change is shown
 *    as the server actually stored it rather than as the user intended it.
 *  - The error message comes from the API where there is one. The backend returns actionable
 *    conflicts ("Configure a default approval policy first"), and replacing those with a generic
 *    string strands the user with a problem they cannot diagnose.
 */
export function useMutationRunner(refetch: () => Promise<unknown>) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const run = useCallback(
    async (
      operation: () => Promise<unknown>,
      fallbackMessage: string,
      successMessage = 'Changes saved.',
    ) => {
      setSaving(true);
      setSaveError(null);
      try {
        await operation();
        await refetch();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ems:feedback', { detail: { tone: 'success', message: successMessage } }),
          );
        }
        return true;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : fallbackMessage;
        setSaveError(message);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ems:feedback', { detail: { tone: 'error', message } }));
        }
        await refetch();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [refetch],
  );

  return { saving, saveError, setSaveError, run };
}
