'use client';

import React, { useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@smarteam/ui';
import { HelpCircle, Plus, Upload, X } from 'lucide-react';
import { parseDuration } from '../../services/timesheet-view';
import type { ManualEntryInput } from '../../repositories/timesheet.repository';
import type { JobType, Project } from '@smarteam/contracts';
import { QuickAddJobDialog } from './quick-add-job-dialog';
import { QuickAddProjectDialog } from './quick-add-project-dialog';

interface LogTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  saving: boolean;
  saveError: string | null;
  periodStart?: string;
  periodEnd?: string;
  projects?: Project[];
  jobTypes?: JobType[];
  onSubmit: (input: ManualEntryInput) => Promise<boolean>;
  onCreateJobType?: (name: string) => Promise<unknown>;
  onCreateProject?: (name: string, description?: string) => Promise<unknown>;
}

export function LogTimeModal({
  isOpen,
  onClose,
  saving,
  saveError,
  periodStart,
  periodEnd,
  projects = [],
  jobTypes = [],
  onSubmit,
  onCreateJobType,
  onCreateProject,
}: LogTimeModalProps) {
  const initialDate = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [projectId, setProjectId] = useState<string>('');
  const [jobName, setJobName] = useState<string>('');
  const [workItem, setWorkItem] = useState('');
  const [workDate, setWorkDate] = useState(initialDate);
  const [description, setDescription] = useState('');
  const [hoursMode, setHoursMode] = useState<'TOTAL' | 'START_END'>('TOTAL');
  const [totalHours, setTotalHours] = useState('08:00');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [billable, setBillable] = useState<boolean>(true);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [isQuickAddJobOpen, setIsQuickAddJobOpen] = useState(false);
  const [isQuickAddProjectOpen, setIsQuickAddProjectOpen] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setError('');
      setWorkDate(new Date().toISOString().slice(0, 10));
      if (projects.length > 0 && !projectId) {
        setProjectId(projects[0]?.id ?? '');
      }
      if (jobTypes.length > 0 && !jobName) {
        setJobName(jobTypes[0]?.name ?? 'Development');
      }
    }
  }, [isOpen, projects, jobTypes, projectId, jobName]);

  const reset = () => {
    setProjectId(projects[0]?.id ?? '');
    setJobName(jobTypes[0]?.name ?? 'Development');
    setWorkItem('');
    setWorkDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setHoursMode('TOTAL');
    setTotalHours('08:00');
    setStartTime('09:00');
    setEndTime('17:00');
    setBillable(true);
    setAttachmentName(null);
    setError('');
  };

  const calculateMinutesFromStartEnd = (start: string, end: string): number | null => {
    try {
      const [startH = 0, startM = 0] = start.split(':').map(Number);
      const [endH = 0, endM = 0] = end.split(':').map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;
      if (endTotal <= startTotal) return null;
      return endTotal - startTotal;
    } catch {
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!workDate) {
      setError('Select the date the work was done.');
      return;
    }
    if (!jobName.trim()) {
      setError('Select a Job Name.');
      return;
    }

    let minutes = 0;
    if (hoursMode === 'TOTAL') {
      const parsed = parseDuration(totalHours);
      if (parsed === null || parsed < 1) {
        setError('Enter a valid duration (e.g. 8h, 08:30, or 45m).');
        return;
      }
      minutes = parsed;
    } else {
      const diff = calculateMinutesFromStartEnd(startTime, endTime);
      if (diff === null || diff <= 0) {
        setError('End time must be after Start time.');
        return;
      }
      minutes = diff;
    }

    const selectedProject = projects.find((p) => p.id === projectId);

    setError('');
    const saved = await onSubmit({
      workDate,
      minutes,
      description: description.trim() || undefined,
      projectId: projectId || undefined,
      projectName: selectedProject?.name,
      jobName: jobName.trim(),
      workItem: workItem.trim() || undefined,
      billable,
      startTime: hoursMode === 'START_END' ? startTime : undefined,
      endTime: hoursMode === 'START_END' ? endTime : undefined,
      attachmentUrl: attachmentName ? `https://storage.local/${attachmentName}` : undefined,
    });

    if (saved) {
      reset();
      onClose();
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            reset();
            onClose();
          }
        }}
      >
        <DialogContent className="flex flex-col max-h-[82vh] sm:max-h-[88vh] w-[95vw] sm:max-w-2xl gap-0 p-0 overflow-hidden bg-card border-border shadow-2xl z-[60]">
          {/* Header */}
          <DialogHeader className="shrink-0 flex flex-row items-center justify-between border-b border-border/80 px-6 py-3 bg-muted/20">
            <DialogTitle className="text-base font-semibold text-foreground tracking-tight">
              Log Time
            </DialogTitle>
          </DialogHeader>

          {/* Form Content - 2 Column Zoho People Layout */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-4 sm:py-5 space-y-3.5 text-xs">
            {/* Project Name */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <Label className="text-foreground/80 font-medium sm:col-span-1 text-xs">
                Project Name
              </Label>
              <div className="flex items-center gap-2 sm:col-span-3">
                <Select
                  value={projectId}
                  onValueChange={setProjectId}
                  disabled={saving}
                  placeholder="Select"
                  className="w-full text-xs"
                >
                  <option value="">Select</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsQuickAddProjectOpen(true)}
                  className="h-8 w-8 p-0 shrink-0 border-border text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Quick-add Project"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Job Name */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <Label className="text-foreground/80 font-medium sm:col-span-1 text-xs">
                Job Name <span className="text-destructive font-bold">*</span>
              </Label>
              <div className="flex items-center gap-2 sm:col-span-3">
                <Select
                  value={jobName}
                  onValueChange={setJobName}
                  disabled={saving}
                  placeholder="Select"
                  className="w-full text-xs"
                >
                  <option value="">Select</option>
                  {jobTypes.map((j) => (
                    <option key={j.id || j.name} value={j.name}>
                      {j.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsQuickAddJobOpen(true)}
                  className="h-8 w-8 p-0 shrink-0 border-border text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Quick-add Job Type"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Work Item */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <Label
                htmlFor="log-work-item"
                className="text-foreground/80 font-medium sm:col-span-1 text-xs"
              >
                Work Item
              </Label>
              <div className="sm:col-span-3">
                <Input
                  id="log-work-item"
                  placeholder=""
                  value={workItem}
                  onChange={(e) => setWorkItem(e.target.value)}
                  disabled={saving}
                  className="text-xs h-8"
                />
              </div>
            </div>

            {/* Date */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <Label
                htmlFor="log-date"
                className="text-foreground/80 font-medium sm:col-span-1 text-xs"
              >
                Date <span className="text-destructive font-bold">*</span>
              </Label>
              <div className="sm:col-span-3">
                <DatePicker
                  id="log-date"
                  value={workDate}
                  onChange={setWorkDate}
                  disabled={saving}
                  min={periodStart}
                  max={periodEnd}
                />
              </div>
            </div>

            {/* Description */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
              <Label
                htmlFor="log-description"
                className="text-foreground/80 font-medium pt-2 sm:col-span-1 text-xs"
              >
                Description
              </Label>
              <div className="sm:col-span-3">
                <Textarea
                  id="log-description"
                  placeholder=""
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={saving}
                  rows={3}
                  className="text-xs resize-none"
                />
              </div>
            </div>

            {/* Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
              <Label className="text-foreground/80 font-medium pt-1 sm:col-span-1 text-xs">
                Hours <span className="text-destructive font-bold">*</span>
              </Label>
              <div className="space-y-3 sm:col-span-3">
                {/* Radio selection */}
                <div className="flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-normal text-foreground">
                    <input
                      type="radio"
                      name="hours-mode"
                      checked={hoursMode === 'TOTAL'}
                      onChange={() => setHoursMode('TOTAL')}
                      className="text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span>Total hours</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-normal text-foreground">
                    <input
                      type="radio"
                      name="hours-mode"
                      checked={hoursMode === 'START_END'}
                      onChange={() => setHoursMode('START_END')}
                      className="text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span>Start and end time</span>
                  </label>
                </div>

                {hoursMode === 'TOTAL' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={totalHours}
                      onChange={(e) => setTotalHours(e.target.value)}
                      placeholder="00:00"
                      disabled={saving}
                      className="w-24 font-mono text-xs h-8 text-center"
                    />
                    <span title="Enter hours in HH:MM or duration format">
                      <HelpCircle className="h-4 w-4 text-amber-500/80 shrink-0 cursor-help" />
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-w-xs">
                    <div>
                      <Label
                        htmlFor="start-time"
                        className="text-[11px] text-muted-foreground mb-1 block"
                      >
                        Start time
                      </Label>
                      <Input
                        id="start-time"
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        disabled={saving}
                        className="font-mono text-xs h-8"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="end-time"
                        className="text-[11px] text-muted-foreground mb-1 block"
                      >
                        End time
                      </Label>
                      <Input
                        id="end-time"
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        disabled={saving}
                        className="font-mono text-xs h-8"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Billable Status */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <Label className="text-foreground/80 font-medium sm:col-span-1 text-xs">
                Billable Status <span className="text-destructive font-bold">*</span>
              </Label>
              <div className="sm:col-span-3">
                <Select
                  value={billable ? 'BILLABLE' : 'NON_BILLABLE'}
                  onValueChange={(val) => setBillable(val === 'BILLABLE')}
                  disabled={saving}
                  className="w-44 text-xs"
                >
                  <option value="BILLABLE">Billable</option>
                  <option value="NON_BILLABLE">Non-Billable</option>
                </Select>
              </div>
            </div>

            {/* Attachment */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
              <Label className="text-foreground/80 font-medium pt-1 sm:col-span-1 text-xs">
                Attachment
              </Label>
              <div className="sm:col-span-3 space-y-1">
                {attachmentName ? (
                  <div className="flex items-center justify-between p-2.5 border border-border rounded-md bg-muted/20 max-w-md">
                    <span className="truncate font-medium text-xs text-foreground">
                      {attachmentName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachmentName(null)}
                      className="text-muted-foreground hover:text-destructive p-1 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="border border-border/80 rounded-md p-4 bg-muted/10 text-center space-y-1.5 hover:bg-muted/20 transition-colors">
                    <label className="cursor-pointer block text-xs text-muted-foreground">
                      <span>Upload from </span>
                      <span className="text-primary font-medium hover:underline inline-flex items-center gap-1">
                        <Upload className="h-3 w-3 inline" /> Desktop
                      </span>
                      <span> / </span>
                      <span className="text-primary font-medium hover:underline">WorkDrive</span>
                      <span> / </span>
                      <span className="text-primary font-medium hover:underline">Others</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setAttachmentName(f.name);
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-muted-foreground">Max. size is 5 MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Error Display */}
            {(error || saveError) && (
              <p className="text-xs font-medium text-destructive pt-1" role="alert">
                {error || saveError}
              </p>
            )}
          </div>

          {/* Bottom Actions - Aligned bottom-left matching Zoho People reference */}
          <div className="shrink-0 flex items-center justify-start gap-2.5 border-t border-border/80 bg-muted/30 px-5 sm:px-8 py-3">
            <Button
              disabled={saving}
              onClick={() => void handleSubmit()}
              type="button"
              className="px-5 font-semibold text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              disabled={saving}
              onClick={onClose}
              type="button"
              variant="outline"
              className="px-5 text-xs h-8 border-border bg-card hover:bg-muted text-foreground cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Dialogs */}
      <QuickAddJobDialog
        isOpen={isQuickAddJobOpen}
        onClose={() => setIsQuickAddJobOpen(false)}
        onAdd={async (name) => {
          if (onCreateJobType) {
            await onCreateJobType(name);
            setJobName(name);
          }
        }}
      />

      <QuickAddProjectDialog
        isOpen={isQuickAddProjectOpen}
        onClose={() => setIsQuickAddProjectOpen(false)}
        onAdd={async (name, description) => {
          if (onCreateProject) {
            const created = (await onCreateProject(name, description)) as Project | undefined;
            if (created && 'id' in created && typeof created.id === 'string') {
              setProjectId(created.id);
            }
          }
        }}
      />
    </>
  );
}
