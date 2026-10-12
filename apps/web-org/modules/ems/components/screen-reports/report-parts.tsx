'use client';

import React, { useState } from 'react';
import { Button, Input } from '@smarteam/ui';
import { Download } from 'lucide-react';
import { downloadFile, toCsv } from '../../lib/csv';
import { downloadReportPdf } from '../../lib/report-pdf';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

/** A headline figure. */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Horizontal bars, scaled to the largest value; one per label. */
export function Bars({
  title,
  rows,
  unit = '',
  split,
}: {
  title: string;
  rows: Array<{ label: string; value: number; second?: number }>;
  unit?: string;
  /** Labels for a two-part bar, e.g. billable and non-billable. */
  split?: [string, string];
}) {
  const max = rows.reduce((largest, row) => Math.max(largest, row.value + (row.second ?? 0)), 1);
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-foreground">{title}</h3>
        {split && (
          <span className="flex gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary" /> {split[0]}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary/35" /> {split[1]}
            </span>
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing to show for this period.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs"
              key={row.label}
            >
              <span className="truncate text-muted-foreground" title={row.label}>
                {row.label}
              </span>
              <span className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="h-full bg-primary"
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
                {row.second !== undefined && (
                  <span
                    className="h-full bg-primary/35"
                    style={{ width: `${(row.second / max) * 100}%` }}
                  />
                )}
              </span>
              <span className="tabular-nums font-semibold text-foreground">
                {row.value + (row.second ?? 0)}
                {unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A plain table with a spreadsheet export of exactly what is shown. */
export function ReportTable({
  title,
  fileName,
  columns,
  rows,
}: {
  title: string;
  fileName: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  const [search, setSearch] = useState('');
  const [requestedPage, setPage] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const query = useDebouncedValue(search.trim()).toLowerCase();
  const filtered = query
    ? rows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(query)))
    : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const page = Math.min(requestedPage, pages - 1);
  const visible = filtered.slice(page * 50, (page + 1) * 50);
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-xs font-bold text-foreground">{title}</h3>
        <div className="flex gap-2">
          <Button
            className="gap-1.5"
            disabled={rows.length === 0}
            onClick={() => downloadFile(fileName, toCsv([columns, ...filtered]))}
            size="sm"
            type="button"
            variant="outline"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button
            className="gap-1.5"
            disabled={!filtered.length || pdfBusy}
            onClick={async () => {
              setPdfBusy(true);
              try {
                await downloadReportPdf(title, columns, filtered);
              } finally {
                setPdfBusy(false);
              }
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <Download className="h-3.5 w-3.5" /> {pdfBusy ? 'Preparing PDF…' : 'Export PDF'}
          </Button>
        </div>
      </div>
      <div className="px-4 py-2">
        <Input
          aria-label={`Search ${title}`}
          placeholder="Search this report"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {columns.map((column, index) => (
                <th className={`px-4 py-2 font-bold ${index > 0 ? 'text-right' : ''}`} key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  {query
                    ? 'No report rows match. Clear the search to see all results.'
                    : 'Nothing recorded in this period.'}
                </td>
              </tr>
            ) : (
              visible.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td
                      className={`px-4 py-2 ${index > 0 ? 'text-right tabular-nums' : 'font-medium text-foreground'}`}
                      key={index}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav
        aria-label={`${title} pages`}
        className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs"
      >
        <span role="status">
          Page {page + 1} of {pages} · {filtered.length} matches · Export all includes {rows.length}{' '}
          records
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous report page
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page + 1 === pages}
            onClick={() => setPage(page + 1)}
          >
            Next report page
          </Button>
        </div>
      </nav>
    </section>
  );
}
