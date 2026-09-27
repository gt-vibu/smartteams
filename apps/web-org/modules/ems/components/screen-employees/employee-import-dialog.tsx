'use client';

import React, { useRef, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle } from '@smarteam/ui';
import { CheckCircle2, Download, FileUp, XCircle } from 'lucide-react';
import { useSession } from '../../hooks/auth-context';
import { downloadFile, parseCsv, toCsv } from '../../lib/csv';
import {
  employeeImportRepository,
  type ImportResult,
  type ImportRow,
} from '../../repositories/employee-import.repository';

/** Column headings as they appear in the template, and the other names people give them. */
const COLUMNS: Array<{ key: keyof ImportRow; label: string; also: string[]; required?: boolean }> =
  [
    { key: 'firstName', label: 'First name', also: ['first', 'given name'], required: true },
    { key: 'middleName', label: 'Middle name', also: ['middle'] },
    { key: 'lastName', label: 'Last name', also: ['last', 'surname'], required: true },
    { key: 'employeeNumber', label: 'Employee ID', also: ['employee number', 'emp id', 'id'] },
    { key: 'workEmail', label: 'Work email', also: ['email', 'official email'] },
    { key: 'personalEmail', label: 'Personal email', also: [] },
    { key: 'phone', label: 'Phone', also: ['mobile', 'phone number'] },
    { key: 'employmentType', label: 'Employment type', also: ['type'] },
    { key: 'dateOfJoining', label: 'Date of joining', also: ['joining date', 'doj', 'start date'] },
    { key: 'aadhaarNumber', label: 'Aadhaar', also: ['aadhaar number', 'aadhar'], required: true },
    { key: 'branch', label: 'Branch', also: ['location', 'office'] },
    { key: 'department', label: 'Department', also: ['dept'] },
  ];

const normalise = (heading: string) => heading.trim().toLowerCase().replace(/[_*]/g, ' ');

function toRows(table: string[][]): { rows: ImportRow[]; unknown: string[]; missing: string[] } {
  const [header = [], ...body] = table;
  const index = header.map((heading) => {
    const name = normalise(heading);
    return COLUMNS.find((column) => normalise(column.label) === name || column.also.includes(name))
      ?.key;
  });
  const rows = body.map((cells) => {
    const row: ImportRow = {};
    cells.forEach((value, i) => {
      const key = index[i];
      if (key && value.trim()) row[key] = value.trim();
    });
    return row;
  });
  return {
    rows,
    unknown: header.filter((_, i) => !index[i] && header[i]?.trim()),
    missing: COLUMNS.filter((column) => column.required && !index.includes(column.key)).map(
      (column) => column.label,
    ),
  };
}

function downloadTemplate() {
  downloadFile(
    'employee-import-template.csv',
    toCsv([
      COLUMNS.map((column) => column.label),
      [
        'Asha',
        '',
        'Rao',
        '',
        'asha.rao@company.com',
        '',
        '9876543210',
        'Full time',
        '01/10/2026',
        '2345 6789 0123',
        'Headquarters',
        'Engineering',
      ],
    ]),
  );
}

type Step =
  | { kind: 'choose' }
  | { kind: 'checked'; fileName: string; rows: ImportRow[]; result: ImportResult }
  | { kind: 'done'; result: ImportResult };

/**
 * Hiring from a spreadsheet, in three steps a person can follow: get the template, check the file
 * — every problem named on its row, nothing written — then import the rows that passed. Rows with
 * problems are left out and listed, so they can be fixed and imported on their own.
 */
export function EmployeeImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? '';
  const picker = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setStep({ kind: 'choose' });
    setError('');
    onClose();
  };

  const check = async (file: File | undefined) => {
    if (picker.current) picker.current.value = '';
    if (!file) return;
    setError('');
    if (!/\.csv$/i.test(file.name))
      return setError('Choose a .csv file. In Excel: File → Save As → CSV UTF-8.');
    const { rows, unknown, missing } = toRows(parseCsv(await file.text()));
    if (missing.length) return setError(`The file needs these columns: ${missing.join(', ')}.`);
    if (rows.length === 0) return setError('The file has a header but no employees under it.');
    if (rows.length > 1000) return setError('Import up to 1,000 employees at a time.');
    setBusy(true);
    try {
      const result = await employeeImportRepository.run(organizationId, rows, true);
      setStep({ kind: 'checked', fileName: file.name, rows, result });
      if (unknown.length)
        setError(`These columns were not recognised and are ignored: ${unknown.join(', ')}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The file could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (step.kind !== 'checked') return;
    setBusy(true);
    setError('');
    try {
      const good = step.rows.filter((_, i) => step.result.rows[i]?.ok);
      const result = await employeeImportRepository.run(organizationId, good, false);
      setStep({ kind: 'done', result });
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import did not complete.');
    } finally {
      setBusy(false);
    }
  };

  const result = step.kind === 'choose' ? null : step.result;
  const problems = result?.rows.filter((row) => !row.ok) ?? [];

  return (
    <Dialog onOpenChange={(next) => !next && !busy && close()} open={open}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-semibold">
          Import employees
        </DialogTitle>

        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:max-h-[70vh]">
          {step.kind === 'choose' && (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Download the template and fill in one employee per row.</li>
                <li>Save it as CSV and choose it below. Nothing is saved yet.</li>
                <li>Review what was found, then import the rows that are ready.</li>
              </ol>
              <p className="text-[11px] text-muted-foreground">
                First name, last name and Aadhaar are required. Dates can be DD/MM/YYYY or
                YYYY-MM-DD. Branch and department must match names already set up. An employee ID
                left blank is generated.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="gap-1.5"
                  onClick={downloadTemplate}
                  type="button"
                  variant="outline"
                >
                  <Download className="h-3.5 w-3.5" /> Download template
                </Button>
                <input
                  accept=".csv,text/csv"
                  aria-label="Choose the CSV file to import"
                  className="hidden"
                  onChange={(event) => void check(event.target.files?.[0])}
                  ref={picker}
                  type="file"
                />
                <Button
                  className="gap-1.5"
                  disabled={busy || !organizationId}
                  onClick={() => picker.current?.click()}
                  type="button"
                >
                  <FileUp className="h-3.5 w-3.5" /> {busy ? 'Checking…' : 'Choose CSV file'}
                </Button>
              </div>
            </>
          )}

          {result && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Rows', result.total],
                  [step.kind === 'done' ? 'Imported' : 'Ready', result.valid],
                  ['Need fixing', result.invalid],
                ].map(([label, value]) => (
                  <div className="rounded-md border border-border px-2 py-2" key={label}>
                    <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              {step.kind === 'checked' && (
                <p className="text-xs text-muted-foreground">
                  Checked <span className="font-semibold text-foreground">{step.fileName}</span>.{' '}
                  {result.valid
                    ? `${result.valid} employee${result.valid === 1 ? ' is' : 's are'} ready to import.`
                    : 'No row is ready yet.'}
                </p>
              )}
              {step.kind === 'done' && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {result.valid} employee{result.valid === 1 ? '' : 's'} added to the directory.
                </p>
              )}
              {problems.length > 0 && (
                <div className="rounded-md border border-border">
                  <p className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Rows to fix
                  </p>
                  <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                    {problems.map((row) => (
                      <li className="flex gap-2 px-3 py-2 text-xs" key={row.row}>
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        <span>
                          <span className="font-semibold text-foreground">
                            Row {row.row + 1} · {row.name}
                          </span>
                          <span className="block text-muted-foreground">
                            {row.errors.join(' ')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-medium text-destructive" role="alert">
            {error}
          </p>
          <div className="flex justify-end gap-2">
            {step.kind === 'checked' && (
              <Button
                disabled={busy}
                onClick={() => setStep({ kind: 'choose' })}
                type="button"
                variant="outline"
              >
                Choose another file
              </Button>
            )}
            {step.kind === 'checked' ? (
              <Button
                disabled={busy || result?.valid === 0}
                onClick={() => void commit()}
                type="button"
              >
                {busy
                  ? 'Importing…'
                  : `Import ${result?.valid ?? 0} employee${result?.valid === 1 ? '' : 's'}`}
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={close}
                type="button"
                variant={step.kind === 'done' ? 'default' : 'outline'}
              >
                {step.kind === 'done' ? 'Done' : 'Cancel'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
