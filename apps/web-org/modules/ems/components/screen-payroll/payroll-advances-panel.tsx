'use client';

import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import type { SalaryAdvance } from '@smarteam/contracts';
import type { AdvanceAllowance } from '../../repositories/payroll.repository';
import { AllowanceSummary, allowanceBlock } from './advance-allowance';
import { AdvanceRequestDialog } from './advance-request-dialog';
import { AdvanceHistory } from './advance-history';

/**
 * Salary advances.
 *
 * A request is a real mutation: the screen this replaced pushed a `REQUESTED` row into component
 * state, so the advance existed only in the browser that asked for it — invisible to the
 * approver, and invisible to payroll, which recovers approved advances from net pay.
 */

export function PayrollAdvancesPanel({
  advances,
  allowance,
  canRequest,
  onRequest,
  saving,
  saveError,
}: {
  advances: SalaryAdvance[];
  allowance: AdvanceAllowance | null;
  canRequest: boolean;
  onRequest: (input: { requestedAmount: number; reason: string }) => Promise<boolean>;
  saving: boolean;
  saveError: string | null;
}) {
  const [open, setOpen] = useState(false);
  const blocked = allowance ? allowanceBlock(allowance) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          {canRequest && allowance ? (
            <AllowanceSummary allowance={allowance} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Approved advances are recovered from net pay by the payroll run.
            </p>
          )}
        </div>
        {canRequest && (
          <Button
            className="w-full sm:w-auto"
            disabled={!allowance}
            onClick={() => setOpen(true)}
            title={blocked?.detail}
            type="button"
          >
            Request advance
          </Button>
        )}
      </div>

      <AdvanceHistory advances={advances} />

      <AdvanceRequestDialog
        allowance={allowance}
        onOpenChange={setOpen}
        onRequest={onRequest}
        open={open}
        saveError={saveError}
        saving={saving}
      />
    </div>
  );
}
