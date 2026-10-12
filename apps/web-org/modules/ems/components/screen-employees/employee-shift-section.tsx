'use client';

import React, { useState } from 'react';
import { LoadingIndicator, Button, Input, Label } from '@smarteam/ui';
import { formatDate, hasPermission, formatDateRange } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { shiftsRepository } from '../../repositories/shifts.repository';
import { ShiftPicker } from '../common/shift-picker';

const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());

/**
 * An employee's shift: the one they are on now, changing it from a date (the previous one then
 * ends the day before), and the shifts they worked before. Overtime is measured against it.
 */
export function EmployeeShiftSection({
  employeeId,
  readOnly,
}: {
  employeeId: string;
  readOnly: boolean;
}) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId ?? '';
  const permissions = persona?.permissions ?? [];
  const canRead = hasPermission(permissions, 'shifts.read');
  const canWrite = !readOnly && hasPermission(permissions, 'shifts.write');
  const history = useAsyncResource(
    () => shiftsRepository.assignments(organizationId, { employeeId, includeEnded: true }),
    [organizationId, employeeId],
    { enabled: Boolean(organizationId) && canRead },
  );
  const [changing, setChanging] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [from, setFrom] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canRead) return null;
  const rows = history.data?.items ?? [];
  const current = rows.find((row) => row.state === 'CURRENT') ?? null;
  const upcoming = rows.filter((row) => row.state === 'UPCOMING');
  const past = rows.filter((row) => row.state === 'ENDED');

  const save = async () => {
    if (!shiftId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await shiftsRepository.assign(organizationId, employeeId, { shiftId, startsOn: from });
      await history.refetch();
      setChanging(false);
      setShiftId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The shift could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Shift
        </h3>
        {canWrite && !changing && (
          <Button onClick={() => setChanging(true)} size="sm" type="button" variant="outline">
            {current ? 'Change shift' : 'Assign shift'}
          </Button>
        )}
      </div>
      {history.loading ? (
        <LoadingIndicator variant="inline" label="Preparing content" className="text-muted-foreground" />
      ) : current ? (
        <p>
          <span className="font-semibold text-foreground">{current.shift.name}</span>
          <span className="text-muted-foreground">
            {' '}
            · since {formatDate(current.startsOn)}
            {current.endsOn ? ` · until ${formatDate(current.endsOn)}` : ' · permanent'}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">
          No shift. Overtime is measured against the organization’s standard day.
        </p>
      )}
      {upcoming.map((row) => (
        <p className="text-muted-foreground" key={row.id}>
          Moves to <span className="font-semibold text-foreground">{row.shift.name}</span> on{' '}
          {formatDate(row.startsOn)}
        </p>
      ))}

      {changing && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div>
            <Label className="mb-1 block">New shift</Label>
            <ShiftPicker
              disabled={busy}
              noneLabel="Choose a shift"
              onChange={setShiftId}
              value={shiftId}
            />
          </div>
          <div>
            <Label className="mb-1 block">From</Label>
            <Input
              disabled={busy}
              onChange={(e) => setFrom(e.target.value)}
              type="date"
              value={from}
            />
          </div>
          {error && (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setChanging(false)} size="sm" type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={busy || !shiftId || !from}
              onClick={() => void save()}
              size="sm"
              type="button"
            >
              {busy ? 'Saving…' : 'Save shift'}
            </Button>
          </div>
        </div>
      )}

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] font-semibold text-primary">
            Earlier shifts ({past.length})
          </summary>
          <ul className="mt-1.5 space-y-1">
            {past.map((row) => (
              <li className="flex justify-between gap-2 text-muted-foreground" key={row.id}>
                <span className="font-semibold text-foreground">{row.shift.name}</span>
                <span>{formatDateRange(row.startsOn, row.endsOn)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
