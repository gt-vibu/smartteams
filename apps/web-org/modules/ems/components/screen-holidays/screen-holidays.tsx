'use client';

import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { Badge, Button, Input } from '@smarteam/ui';
import type { Holiday } from '@smarteam/contracts';
import { useHolidays } from '../../hooks/use-holidays';
import { HolidayDialog, RetireHolidayDialog } from './holiday-dialogs';

/**
 * The holiday calendar.
 *
 * Replaces `holidays.json`, which showed a calendar nothing could act on: the `Holiday` model and
 * its consumers already existed, but no route let a tenant enter a row, so every holiday on the
 * screen was invisible to leave and payroll.
 *
 * What a holiday actually does is stated on the screen, because the two consumers behave very
 * differently: leave stops charging a request for that day, while payroll counts working days but
 * still prorates against its flat day basis.
 */
export function ScreenHolidays() {
  const holidays = useHolidays();
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<Holiday | null>(null);

  if (holidays.forbidden) {
    return (
      <div className="mx-auto w-full max-w-[1380px] px-4 py-4 sm:px-6">
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
          <p className="text-sm font-bold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to view the holiday calendar.
          </p>
        </div>
      </div>
    );
  }

  const active = holidays.holidays.filter((holiday) => holiday.isActive);

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScreenHeader
          description={`${active.length} active ${active.length === 1 ? 'holiday' : 'holidays'} in ${holidays.year}`}
          icon={CalendarDays}
          title="Holiday calendar"
          tone="success"
        />
        <div className="flex items-center gap-2">
          <Input
            aria-label="Year"
            className="w-24"
            inputMode="numeric"
            onChange={(event) => holidays.setYear(event.target.value)}
            type="number"
            value={holidays.year}
          />
          {holidays.canWrite && (
            <Button onClick={() => setCreating(true)} size="sm" type="button">
              Add holiday
            </Button>
          )}
        </div>
      </div>

      {holidays.saveError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {holidays.saveError}
        </p>
      )}

      {holidays.loading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading holidays...
        </p>
      )}

      {!holidays.loading && holidays.error && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
          <p className="text-sm font-bold text-foreground">Could not load holidays</p>
          <p className="mt-1 text-xs text-muted-foreground">{holidays.error}</p>
          <Button
            className="mt-3"
            onClick={() => void holidays.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}

      {!holidays.loading && !holidays.error && holidays.holidays.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-sm font-bold text-foreground">No holidays in {holidays.year}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave requests spanning this year are charged for every working day until a holiday is
            added.
          </p>
        </div>
      )}

      {!holidays.loading && !holidays.error && holidays.holidays.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-bold">Date</th>
                <th className="px-4 py-2.5 font-bold">Holiday</th>
                <th className="px-4 py-2.5 font-bold">Scope</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holidays.holidays.map((holiday) => (
                <tr
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  key={holiday.id}
                >
                  <td className="px-4 py-2.5 font-mono text-foreground">
                    {holiday.holidayDate.slice(0, 10)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-foreground">{holiday.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {holiday.branchId ? 'One branch' : 'Whole organization'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={holiday.isActive ? 'success' : 'secondary'}>
                        {holiday.isActive ? 'Active' : 'Retired'}
                      </Badge>
                      {holiday.isOptional && <Badge variant="outline">Optional</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {holidays.canWrite && holiday.isActive && (
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={() => setEditing(holiday)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Rename
                        </Button>
                        <Button
                          onClick={() => setRetiring(holiday)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Retire
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        An active holiday is excluded from the working days a leave request is charged for. Payroll
        counts holidays into its working-day figure but still prorates pay against the flat payroll
        day basis, so adding one does not by itself change anyone&apos;s pay. Changing the calendar
        affects future calculations only — leave already approved and payroll already calculated
        keep the figures they were given.
      </p>

      <HolidayDialog
        holiday={editing}
        holidays={holidays}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        open={creating || editing !== null}
      />
      <RetireHolidayDialog
        holiday={retiring}
        holidays={holidays}
        onOpenChange={(open) => !open && setRetiring(null)}
        open={retiring !== null}
      />
    </div>
  );
}
