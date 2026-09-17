'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@smarteam/ui';
import type { HolidayConflict } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { holidayConflictsRepository } from '../../repositories/holiday-conflicts.repository';
import { emitDataChanged, useHolidayCheckInAnnouncements } from '../../lib/data-events';
import { HOLIDAY_CHECK_IN_MESSAGE } from '../../services/holiday-conflict-view';
import { HolidayCheckInForm } from './holiday-check-in-form';

/**
 * Asks for a reason straight after a check-in on an approved optional holiday.
 *
 * Mounted once in the layout, because the check-in can come from the attendance bar, Home or the
 * command palette. Closing it does not lose anything: the day keeps showing "reason needed", and
 * its drawer offers the same form.
 */
export function HolidayCheckInPrompt() {
  const { session } = useSession();
  const organizationId = session?.organizationId || null;
  const [conflict, setConflict] = useState<HolidayConflict | null>(null);
  useHolidayCheckInAnnouncements(setConflict);

  const explain = async (reason: string, comment: string) => {
    if (!organizationId || !conflict) throw new Error('No organization is selected.');
    await holidayConflictsRepository.explain(organizationId, conflict.attendanceId, {
      reason,
      ...(comment ? { comment } : {}),
    });
    emitDataChanged('attendance', 'approvals');
  };

  return (
    <Dialog open={conflict !== null} onOpenChange={(open) => !open && setConflict(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Checked in on your holiday</DialogTitle>
        <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {HOLIDAY_CHECK_IN_MESSAGE}
        </p>
        {conflict && (
          <div className="mt-3">
            <p className="mb-2 text-[11px] text-muted-foreground">
              {conflict.holiday.name} · your check-in is recorded.
            </p>
            <HolidayCheckInForm holidayName={conflict.holiday.name} onSubmit={explain} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
