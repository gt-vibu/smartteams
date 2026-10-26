'use client';

import { useEffect, useState } from 'react';
import type { SalaryProfile } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { payrollRepository } from '../repositories/payroll.repository';

export type SalaryDraft = {
  grossSalary: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
};

/**
 * The salary profile as it would be with `draft`, recalculated by the server as the draft
 * changes. Figures appeared only after Save, so an administrator could not see what a salary
 * meant before committing it. The server does the arithmetic, so the preview is the same
 * calculation payroll will use, statutory rules included.
 *
 * Null when there is no draft, or the draft matches what is saved.
 */
export function useSalaryPreview(
  employeeId: string | null,
  draft: SalaryDraft | null,
): { preview: SalaryProfile | null; updating: boolean } {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const [preview, setPreview] = useState<SalaryProfile | null>(null);
  const [updating, setUpdating] = useState(false);
  const key = draft ? JSON.stringify(draft) : '';

  useEffect(() => {
    setPreview(null);
    if (!organizationId || !employeeId || !key) return;
    const input = JSON.parse(key) as SalaryDraft;
    let cancelled = false;
    setUpdating(true);
    // A short pause so typing "50000" asks once, not five times.
    const timer = setTimeout(() => {
      payrollRepository
        .previewSalaryProfile(organizationId, { employeeId, ...input })
        .then((result) => !cancelled && setPreview(result))
        .catch(() => undefined)
        .finally(() => !cancelled && setUpdating(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organizationId, employeeId, key]);

  return { preview, updating };
}
