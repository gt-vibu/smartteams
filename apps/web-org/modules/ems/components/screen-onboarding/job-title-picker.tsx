'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import { usePicklist } from '../../hooks/use-picklist';
import { PicklistSelect } from '../common/picklist-select';
import { Plus } from 'lucide-react';

/**
 * A job title from the company's list: the standard titles, those the company added, and any a
 * current employee already holds, so the same role is not spelt five ways. "+ Add a title" saves
 * a new one for everyone at once, not only when the employee it was typed for is created.
 */
export function JobTitlePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const directory = useEmployeeDirectory({}, false);
  const titles = usePicklist('job-titles');
  const inUse = directory.summary?.jobTitles ?? [];
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState('');
  const addTitle = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError('');
    if (draft.trim().length < 2) return setLocalError('Enter a title with at least 2 characters.');
    const saved = await titles.add(draft.trim().replace(/\s+/g, ' '));
    if (!saved) return setLocalError(titles.error ?? 'The title could not be added.');
    onChange(saved);
    setDraft('');
    setQuickAddOpen(false);
  };
  return (
    <>
      <div className="flex min-w-0 gap-2">
        <div className="min-w-0 flex-1">
          <PicklistSelect
            extra={inUse}
            kind="job-titles"
            onChange={onChange}
            showAddOption={false}
            value={value}
          />
        </div>
        {titles.canAdd && <Button className="shrink-0 gap-1.5" onClick={() => { setDraft(''); setLocalError(''); setQuickAddOpen(true); }} size="sm" type="button" variant="outline"><Plus className="size-3.5" />Quick add</Button>}
      </div>
      <Dialog onOpenChange={setQuickAddOpen} open={quickAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Quick add job title</DialogTitle>
          <form className="mt-3 space-y-3" onSubmit={addTitle}>
            <div className="space-y-1.5">
              <Label htmlFor="quick-job-title">Job title</Label>
              <Input autoFocus id="quick-job-title" maxLength={80} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. People Operations Specialist" value={draft} />
              <p className="text-xs text-muted-foreground">The employee will keep the standard Employee access settings.</p>
            </div>
            {(localError || titles.error) && <p className="text-xs text-destructive" role="alert">{localError || titles.error}</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setQuickAddOpen(false)} type="button" variant="outline">Cancel</Button>
              <Button disabled={titles.saving || draft.trim().length < 2} type="submit">{titles.saving ? 'Adding…' : 'Add title'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
