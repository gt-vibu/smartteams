'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Button,
  Label,
  Input,
  Select,
  Textarea,
  Switch,
  DatePicker,
} from '@smarteam/ui';
import { LogTimeFormData } from '../../types/logtime-form.types';

interface LogTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: LogTimeFormData) => void;
}

export function LogTimeModal({ isOpen, onClose, onSave }: LogTimeModalProps) {
  const [date, setDate] = useState('2026-08-25');
  const [projectName, setProjectName] = useState('Luxasia 2026');
  const [jobName, setJobName] = useState('Development');
  const [workItem, setWorkItem] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [hours, setHours] = useState('02:00');
  const [description, setDescription] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSave) {
      onSave({
        date,
        projectName,
        jobName,
        workItem,
        isBillable,
        hours,
        description,
      });
    }
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      onClose();
    }, 900);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
              ⏱
            </span>
            <DialogTitle>Log Work Time</DialogTitle>
          </div>
          <DialogDescription>
            Record work duration against assigned project tasks and sprint deliverables.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
          {/* Row 1: Date & Project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                Log Date <span className="text-rose-500">*</span>
              </Label>
              <DatePicker value={date} onChange={(d) => setDate(d)} placeholder="Select Date" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="project-name-select">
                Project Name <span className="text-rose-500">*</span>
              </Label>
              <Select
                id="project-name-select"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
              >
                <option value="Luxasia 2026">Luxasia 2026</option>
                <option value="Internal-Project 2026">Internal-Project 2026</option>
                <option value="Smarteam EMS Redesign">Smarteam EMS Redesign</option>
              </Select>
            </div>
          </div>

          {/* Row 2: Job Name & Work Item */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="job-name-select">
                Job Track <span className="text-rose-500">*</span>
              </Label>
              <Select
                id="job-name-select"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                required
              >
                <option value="Development">Development</option>
                <option value="Code Review">Code Review</option>
                <option value="Architecture & Planning">Architecture & Planning</option>
                <option value="Testing & QA">Testing & QA</option>
                <option value="Client Sync">Client Sync</option>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="work-item-input">Work Item / Issue ID</Label>
              <Input
                id="work-item-input"
                type="text"
                value={workItem}
                onChange={(e) => setWorkItem(e.target.value)}
                placeholder="e.g. LUX-402, SMAR-109"
              />
            </div>
          </div>

          {/* Row 3: Time Spent & Billable Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="space-y-1">
              <Label htmlFor="time-spent-input">
                Time Spent (HH:MM) <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="time-spent-input"
                type="text"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="02:30"
                className="font-mono"
                required
              />
            </div>

            <div className="space-y-1 pt-4">
              <div className="flex items-center justify-between p-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#161B22]">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Client Billable
                </span>
                <Switch checked={isBillable} onCheckedChange={setIsBillable} />
              </div>
            </div>
          </div>

          {/* Description Textarea */}
          <div className="space-y-1">
            <Label htmlFor="log-desc-textarea">Work Summary</Label>
            <Textarea
              id="log-desc-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the tasks, tickets, or modules worked on..."
            />
          </div>

          {/* Submission Feedback */}
          {isSubmitted && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs rounded-md font-semibold flex items-center gap-2">
              <span>✓</span>
              <span>Time log entry saved to your weekly timesheet!</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save Time Entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
