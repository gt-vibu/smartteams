'use client';

import React, { useState } from 'react';
import { Button } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { apiRequest } from '../../lib/api-client';
import { downloadFile, toCsv } from '../../lib/csv';
import { orgPath } from '../../repositories/api-helpers';

type Statutory = {
  run: { periodStart: string; periodEnd: string };
  rows: Array<{
    employeeNumber: string;
    name: string;
    registrationNumber: string | null;
    grossWages: number;
    wageBasis: number;
    employeeContribution: number;
    employerContribution: number;
  }>;
  missingRegistration: number;
};

type BankFile = {
  run: { periodStart: string; periodEnd: string };
  rows: Array<{
    employeeNumber: string;
    name: string;
    accountHolder: string | null;
    accountNumber: string | null;
    ifsc: string | null;
    bank: string | null;
    amount: number;
  }>;
  missingAccounts: number;
};

const REGISTRATION: Record<'EPF' | 'ESIC' | 'PT', string> = {
  EPF: 'UAN',
  ESIC: 'ESIC IP number',
  PT: 'PT registration',
};

/**
 * What a released run hands on: the EPF, ESIC and professional-tax returns and the bank transfer
 * file, each as a spreadsheet. The bank file needs the payments permission and is recorded in the
 * audit trail, because it carries account numbers.
 */
export function PayrollRunExports({ runId, canPay }: { runId: string; canPay: boolean }) {
  const { session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const base = session ? orgPath(session.organizationId, `/payroll/runs/${runId}`) : '';

  const statutory = async (scheme: 'EPF' | 'ESIC' | 'PT') => {
    setBusy(scheme);
    setNote(null);
    try {
      const report = (await apiRequest(`${base}/statutory?scheme=${scheme}`, {
        method: 'GET',
      })) as Statutory;
      if (report.rows.length === 0) {
        setNote({ error: false, text: `No ${scheme} contributions in this run.` });
        return;
      }
      downloadFile(
        `${scheme.toLowerCase()}-${report.run.periodStart}.csv`,
        toCsv([
          [
            'Employee ID',
            'Name',
            REGISTRATION[scheme],
            'Gross wages',
            'Wages for contribution',
            'Employee share',
            'Employer share',
          ],
          ...report.rows.map((row) => [
            row.employeeNumber,
            row.name,
            row.registrationNumber ?? '',
            row.grossWages,
            row.wageBasis,
            row.employeeContribution,
            row.employerContribution,
          ]),
        ]),
      );
      if (report.missingRegistration)
        setNote({
          error: true,
          text: `${report.missingRegistration} ${report.missingRegistration === 1 ? 'person has' : 'people have'} no ${REGISTRATION[scheme]} recorded.`,
        });
    } catch (caught) {
      setNote({ error: true, text: caught instanceof Error ? caught.message : 'Not exported.' });
    } finally {
      setBusy(null);
    }
  };

  const bank = async () => {
    setBusy('bank');
    setNote(null);
    try {
      const file = (await apiRequest(`${base}/bank-file`, { method: 'GET' })) as BankFile;
      downloadFile(
        `bank-transfer-${file.run.periodStart}.csv`,
        toCsv([
          ['Employee ID', 'Name', 'Account holder', 'Account number', 'IFSC', 'Bank', 'Amount'],
          ...file.rows.map((row) => [
            row.employeeNumber,
            row.name,
            row.accountHolder ?? '',
            row.accountNumber ?? '',
            row.ifsc ?? '',
            row.bank ?? '',
            row.amount,
          ]),
        ]),
      );
      if (file.missingAccounts)
        setNote({
          error: true,
          text: `${file.missingAccounts} ${file.missingAccounts === 1 ? 'person has' : 'people have'} no complete bank details — pay them separately.`,
        });
    } catch (caught) {
      setNote({ error: true, text: caught instanceof Error ? caught.message : 'Not exported.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
      <span className="text-[11px] text-muted-foreground">Returns and transfer</span>
      <div className="flex flex-wrap gap-1.5">
        {(['EPF', 'ESIC', 'PT'] as const).map((scheme) => (
          <Button
            disabled={busy !== null}
            key={scheme}
            onClick={() => void statutory(scheme)}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy === scheme ? '…' : scheme}
          </Button>
        ))}
        {canPay && (
          <Button
            disabled={busy !== null}
            onClick={() => void bank()}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy === 'bank' ? '…' : 'Bank advice'}
          </Button>
        )}
      </div>
      {note && (
        <p
          className={`basis-full text-[11px] ${note.error ? 'text-destructive' : 'text-muted-foreground'}`}
          role={note.error ? 'alert' : 'status'}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
