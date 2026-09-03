'use client';

import { Button } from '@smarteam/ui';

import React, { useState } from 'react';
import { ProfileState } from '../profile/profile-state';
import { useEmployee } from '../../hooks/use-employee';
import { useAttendance } from '../../hooks/use-attendance';
import { PhotoUploadModal } from '../profile/photo-upload-modal';
import { ProfileEditDrawer } from '../profile/profile-edit-drawer';

export function EmployeeProfilePanel() {
  const { employee, loading, error, forbidden, hasEmployeeRecord, refetch } = useEmployee();

  const state = ProfileState({ loading, error, forbidden, hasEmployeeRecord, onRetry: refetch });
  if (state || !employee) return state;

  const { isCheckedIn: checkedIn, timerDisplay, checkIn, checkOut } = useAttendance();
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const isCheckedIn = isMounted && checkedIn;

  const handleToggleAttendance = () => {
    if (checkedIn) {
      void checkOut();
    } else {
      void checkIn();
    }
  };

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

          <Button
            onClick={() => setIsEditDrawerOpen(true)}
            className="text-[11px] font-semibold text-primary dark:text-primary hover:underline mt-1 cursor-pointer"
          >
            Edit Profile
          </Button>
        </div>

        {/* Live Attendance / Timer Card */}
        <div className="bg-slate-50 dark:bg-card rounded-md border border-slate-100 dark:border-border p-3 flex flex-col items-center space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span
              className={`h-2 w-2 rounded-full ${
                isCheckedIn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span
              className={
                isCheckedIn
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-600 dark:text-slate-400'
              }
            >
              {isCheckedIn ? 'In' : 'Out'}
            </span>
          </div>

          {/* Timestamp-derived live timer */}
          <div className="text-xl font-bold font-mono tracking-wider text-slate-800 dark:text-white">
            {isMounted
              ? `${timerDisplay.hrs} : ${timerDisplay.mins} : ${timerDisplay.secs}`
              : '00 : 00 : 00'}
          </div>

          <Button
            variant={isCheckedIn ? 'outline' : 'default'}
            size="sm"
            onClick={handleToggleAttendance}
            className={`w-full py-1.5 px-3 rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer ${
              isCheckedIn
                ? 'bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                : 'bg-slate-900 hover:bg-slate-800 text-white font-bold'
            }`}
          >
            {isCheckedIn ? 'Check out' : 'Check in'}
          </Button>
        </div>

        {/* Reporting Manager Section */}
        {employee.manager ? (
          <div className="pt-2 border-t border-slate-100 dark:border-border">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-2">
              Reporting Manager
            </span>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center">
                {employee.manager.firstName.charAt(0)}
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {employee.manager.employeeNumber} · {employee.manager.firstName}{' '}
                  {employee.manager.lastName}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  In
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-slate-100 dark:border-border">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
              Reporting Manager
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-400 font-medium italic">
              Executive / Head of Department
            </span>
          </div>
        )}

        {/* Department Members Section */}
        <div className="pt-2 border-t border-slate-100 dark:border-border">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-2">
            Department Members ({employee.departmentMembers.length})
          </span>
          <div className="space-y-2">
            {employee.departmentMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center justify-center">
                  {member.firstName.charAt(0)}
                </div>
                <div className="text-xs">
                  <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
                    {member.employeeNumber} · {member.firstName} {member.lastName}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    In
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tax & Statutory Identity Section */}
        <div className="pt-2 border-t border-slate-100 dark:border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
              Tax & Statutory Identity
            </span>
            <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono">
              TY 2026-27
            </span>
          </div>

          <div className="p-2.5 bg-slate-50 dark:bg-card rounded-md border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span className="font-sans text-[11px] text-muted-foreground">PAN:</span>
              <span className="font-bold">AAAPM0192L</span>
            </div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span className="font-sans text-[11px] text-muted-foreground">UAN (PF):</span>
              <span className="font-bold">101928374650</span>
            </div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span className="font-sans text-[11px] text-muted-foreground">Tax Regime:</span>
              <span className="font-sans text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                New (115BAC)
              </span>
            </div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span className="font-sans text-[11px] text-muted-foreground">Prof. Tax (PT):</span>
              <span>₹200 / mo</span>
            </div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300">
              <span className="font-sans text-[11px] text-muted-foreground">TDS Rate:</span>
              <span>10% Statutory</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Photo Upload Modal */}
      <PhotoUploadModal isOpen={isPhotoModalOpen} onClose={() => setIsPhotoModalOpen(false)} />

      {/* Interactive Profile Edit Drawer */}
      <ProfileEditDrawer isOpen={isEditDrawerOpen} onClose={() => setIsEditDrawerOpen(false)} />
    </>
  );
}
