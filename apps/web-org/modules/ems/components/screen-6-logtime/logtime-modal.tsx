import React, { useState } from 'react';
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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop with Blur */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      />

      {/* Centered Modal Card */}
      <div className="relative bg-white rounded-[8px] shadow-2xl border border-slate-200 w-full max-w-xl z-10 overflow-hidden transform transition-all">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-sky-100 text-sky-700 flex items-center justify-center border border-sky-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="!text-sm !font-bold !text-slate-900 !m-0">
                Log Time
              </h2>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Record work duration against assigned project and task
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Row 1: Date & Project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Project Name <span className="text-rose-500">*</span>
              </label>
              <select
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors cursor-pointer"
              >
                <option value="Luxasia 2026">Luxasia 2026</option>
                <option value="Internal-Project 2026">Internal-Project 2026</option>
                <option value="Smarteam EMS Redesign">Smarteam EMS Redesign</option>
              </select>
            </div>
          </div>

          {/* Row 2: Job Name & Work Item */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Name <span className="text-rose-500">*</span>
              </label>
              <select
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors cursor-pointer"
              >
                <option value="Development">Development</option>
                <option value="Testing">Testing</option>
                <option value="Prepare, Explore, Blueprint">Prepare, Explore, Blueprint</option>
                <option value="Deployment Cutover">Deployment Cutover</option>
                <option value="Internal Meeting">Internal Meeting</option>
                <option value="Learning and Knowledge Sharing">Learning and Knowledge Sharing</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Item / Task (Optional)
              </label>
              <input
                type="text"
                value={workItem}
                onChange={(e) => setWorkItem(e.target.value)}
                placeholder="e.g. TASK-1048"
                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
              />
            </div>
          </div>

          {/* Row 3: Time Spent & Billable Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Time Spent (hh:mm) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="02:00"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
              />
            </div>

            <div className="pt-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isBillable}
                  onChange={(e) => setIsBillable(e.target.checked)}
                  className="rounded border-slate-300 text-[#0284C7] focus:ring-sky-500 h-4 w-4 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-800">
                  Billable to Client
                </span>
              </label>
              <p className="text-[10px] text-slate-400 mt-0.5 pl-6">
                Include in invoiceable timesheet reports
              </p>
            </div>
          </div>

          {/* Row 4: Work Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Work Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the tasks, tickets, or accomplishments completed during this time..."
              required
              className="w-full bg-slate-50 border border-slate-200 rounded p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors"
            />
          </div>

          {/* Submission Feedback */}
          {isSubmitted && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded font-semibold flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>Time log saved and submitted successfully!</span>
            </div>
          )}

          {/* Modal Actions Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 rounded transition-colors"
            >
              Save as Draft
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white rounded shadow-xs transition-colors"
            >
              Save & Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
