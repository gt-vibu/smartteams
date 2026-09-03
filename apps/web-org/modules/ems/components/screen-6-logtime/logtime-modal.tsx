'use client';

import React, { useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@smarteam/ui';
import { parseDuration } from '../../services/timesheet-view';
import type { ManualEntryInput } from '../../repositories/timesheet.repository';

interface LogTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  saving: boolean;
  saveError: string | null;
  onSubmit: (input: ManualEntryInput) => Promise<boolean>;
}

/**
 * Logs one manual time entry.
 *
 * The project, task and billable fields the previous version collected have been removed:
 * `ManualEntryDto` has no column for any of them, so every one of those values was discarded on
 * submit. See `docs/backend-gaps.md`.
 */
export function LogTimeModal({ isOpen, onClose, saving, saveError, onSubmit }: LogTimeModalProps) {
  const [workDate, setWorkDate] = useState('');
  const [duration, setDuration] = useState('');
  const [overtime, setOvertime] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setWorkDate('');
    setDuration('');
    setOvertime('');
    setDescription('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!workDate) {
      setError('Select the date the work was done.');
      return;
    }
    const minutes = parseDuration(duration);
    if (minutes === null || minutes < 1) {
      setError('Enter a duration such as 1h 30m, 1:30 or 90.');
      return;
    }
    const overtimeMinutes = overtime.trim() ? parseDuration(overtime) : 0;
    if (overtimeMinutes === null) {
      setError('Overtime must be a duration such as 30m, or left blank.');
      return;
    }
    setError('');
    const saved = await onSubmit({
      workDate,
      minutes,
      ...(overtimeMinutes ? { overtimeMinutes } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    });
    if (saved) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
      open={isOpen}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-semibold">
          Log time
        </DialogTitle>

        <div className="space-y-4 p-5">
          <div>
            <Label className="mb-1 block" htmlFor="log-date">
              Date
            </Label>
            <DatePicker disabled={saving} id="log-date" onChange={setWorkDate} value={workDate} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="log-duration">
                Duration
              </Label>
              <Input
                disabled={saving}
                id="log-duration"
                onChange={(event) => setDuration(event.target.value)}
                placeholder="1h 30m"
                value={duration}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="log-overtime">
                Overtime
              </Label>
              <Input
                disabled={saving}
                id="log-overtime"
                onChange={(event) => setOvertime(event.target.value)}
                placeholder="Optional"
                value={overtime}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block" htmlFor="log-description">
              Description
            </Label>
            <Textarea
              disabled={saving}
              id="log-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Time is recorded against the period, not against a project — the API stores a date, a
            duration and a description.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[11px] font-medium text-destructive" role="alert">
            {error || saveError}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void handleSubmit()} type="button">
              {saving ? 'Saving...' : 'Log time'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
