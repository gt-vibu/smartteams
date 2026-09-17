'use client';

import { Button } from '@smarteam/ui';

import React, { useState } from 'react';
import { ProfileState } from '../profile/profile-state';
import { useEmployee } from '../../hooks/use-employee';
import { useAttendance } from '../../hooks/use-attendance';
import { PhotoUploadModal } from '../profile/photo-upload-modal';
import type { EmployeeProfile } from '../../types/employee.types';

export function EmployeeProfilePanel() {
  // Every hook runs on every render, before any early return. An account can gain an employee
  // record while this component is mounted — an administrator enrolling themselves — and the
  // branch below flips from the "no profile" state to real content. Hooks placed after that
  // branch would appear only on the second of those renders, which React rejects outright.
  const { employee, loading, error, forbidden, hasEmployeeRecord, refetch } = useEmployee();
  const {
    isCheckedIn: checkedIn,
    isDayCompleted,
    sessionMode,
    canCheckInAgain,
    timerDisplay,
    checkIn,
    checkOut,
    saving,
  } = useAttendance();
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const state = ProfileState({ loading, error, forbidden, hasEmployeeRecord, onRetry: refetch });
  if (state || !employee) return state;

  const isCheckedIn = isMounted && checkedIn;

  const handleToggleAttendance = () => {
    if (checkedIn) {
      void checkOut();
    } else if (canCheckInAgain) {
      void checkIn();
    }
  };

  const isSingleCompleted = isDayCompleted && sessionMode === 'SINGLE';

  return (
    <>
      <div className="bg-white dark:bg-card rounded-[6px] border border-slate-200/90 dark:border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 space-y-4 relative z-30">
        {/* Profile Avatar Header */}
        <div className="flex flex-col items-center text-center pt-2">
          {/* Avatar with Photo Upload Trigger */}
          <div className="relative -mt-16 mb-2.5 group">
            <Button
              onClick={() => setIsPhotoModalOpen(true)}
              className="relative h-20 w-20 rounded-full border-4 border-white dark:border-slate-800 shadow-md bg-[#1E293B] text-white flex items-center justify-center font-bold text-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              title="Click to change profile photo"
            >
              {isMounted && employee.avatarUrl ? (
                <img
                  src={employee.avatarUrl}
                  alt={employee.firstName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{isMounted ? employee.firstName.charAt(0) : 'U'}</span>
              )}

              {/* Hover Camera Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            </Button>
          </div>

          <h2 className="text-sm font-bold text-slate-900 dark:text-white m-0">
            {employee.employeeNumber} · {employee.firstName} {employee.lastName}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            {employee.jobTitle}
          </p>
        </div>

        {/* Live Attendance / Timer Card */}
        <div className="bg-slate-50 dark:bg-card rounded-md border border-slate-100 dark:border-border p-3 flex flex-col items-center space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span
              className={`h-2 w-2 rounded-full ${
                isCheckedIn
                  ? 'bg-emerald-500 animate-pulse'
                  : isSingleCompleted
                    ? 'bg-blue-500'
                    : 'bg-slate-400'
              }`}
            />
            <span
              className={
                isCheckedIn
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : isSingleCompleted
                    ? 'text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400'
              }
            >
              {isCheckedIn ? 'In' : isSingleCompleted ? 'Completed' : 'Out'}
            </span>
          </div>

          {/* Timestamp-derived live timer or completed day duration */}
          <div className="text-xl font-bold font-mono tracking-wider text-slate-800 dark:text-white">
            {isMounted
              ? `${timerDisplay.hrs} : ${timerDisplay.mins} : ${timerDisplay.secs}`
              : '00 : 00 : 00'}
          </div>

          {isSingleCompleted ? (
            <div className="w-full text-center">
              <Button
                variant="outline"
                size="sm"
                disabled
                className="w-full py-1.5 px-3 rounded text-xs font-medium bg-muted/60 text-muted-foreground border-border cursor-not-allowed"
              >
                Attendance completed
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1">
                Completed today (1 session policy)
              </p>
            </div>
          ) : (
            <Button
              variant={isCheckedIn ? 'outline' : 'default'}
              size="sm"
              disabled={saving}
              onClick={handleToggleAttendance}
              className={`w-full py-1.5 px-3 rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer ${
                isCheckedIn
                  ? 'bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                  : 'bg-slate-900 hover:bg-slate-800 text-white font-bold'
              }`}
            >
              {saving
                ? 'Processing...'
                : isCheckedIn
                  ? 'Check out'
                  : isDayCompleted
                    ? 'Check in again'
                    : 'Check in'}
            </Button>
          )}
        </div>

        {/*
          People around this employee, when they are known. Neither is today: the profile carries
          only `managerEmployeeId` and there is no endpoint for the manager's details, and
          `department` is free text with no membership behind it (see `useEmployee`). The panel
          used to fill the gap anyway — "Executive / Head of Department" for anyone without a
          manager on record, a green "In" beside every name whatever `isOnline` said, and a
          "Tax & Statutory Identity" block showing the same PAN, UAN and TDS rate to every
          employee. Unknown is shown as absent, not invented; statutory identity comes from the
          compliance API in `EmployeeStatutorySection`.
        */}
        {employee.manager && (
          <PeopleSection title="Reporting manager" people={[employee.manager]} />
        )}
        {employee.departmentMembers.length > 0 && (
          <PeopleSection
            title={`Department members (${employee.departmentMembers.length})`}
            people={employee.departmentMembers}
          />
        )}
      </div>

      {/* Interactive Photo Upload Modal */}
      <PhotoUploadModal isOpen={isPhotoModalOpen} onClose={() => setIsPhotoModalOpen(false)} />
    </>
  );
}

type Person = EmployeeProfile['departmentMembers'][number];

function PeopleSection({ title, people }: { title: string; people: Person[] }) {
  return (
    <div className="border-t border-slate-100 pt-2 dark:border-border">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
        {title}
      </span>
      <div className="space-y-2">
        {people.map((person) => (
          <div key={person.id} className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {person.firstName.charAt(0)}
            </div>
            <div className="min-w-0 text-xs">
              <div className="truncate font-semibold text-slate-800 dark:text-slate-100">
                {person.employeeNumber} · {person.firstName} {person.lastName}
              </div>
              <div
                className={`flex items-center gap-1 text-[10px] font-medium ${
                  person.isOnline
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${person.isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}
                />
                {person.isOnline ? 'In' : 'Out'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
