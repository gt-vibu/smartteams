'use client';

import React, { useState } from 'react';
import { useEmployee } from '../../hooks/use-employee';
import { useAttendance } from '../../hooks/use-attendance';
import { PhotoUploadModal } from '../profile/photo-upload-modal';
import { ProfileEditDrawer } from '../profile/profile-edit-drawer';

export function EmployeeProfilePanel() {
  const { employee } = useEmployee();
  const { liveState, timerDisplay, checkIn, checkOut } = useAttendance();
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

  const handleToggleAttendance = () => {
    if (liveState.isCheckedIn) {
      checkOut('Checked out from overview panel');
    } else {
      checkIn('Checked in from overview panel');
    }
  };

  return (
    <>
      <div className="bg-white rounded-[6px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 space-y-4 relative z-30">
        {/* Profile Avatar Header */}
        <div className="flex flex-col items-center text-center pt-2">
          {/* Avatar with Photo Upload Trigger */}
          <div className="relative -mt-16 mb-2.5 group">
            <button
              onClick={() => setIsPhotoModalOpen(true)}
              className="relative h-20 w-20 rounded-full border-4 border-white shadow-md bg-[#1E293B] text-white flex items-center justify-center font-bold text-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              title="Click to change profile photo"
            >
              {employee.avatarUrl ? (
                <img
                  src={employee.avatarUrl}
                  alt={employee.firstName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{employee.firstName.charAt(0)}</span>
              )}

              {/* Hover Camera Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
          </div>

          <h2 className="!text-sm !font-bold !text-slate-900 !m-0">
            {employee.employeeNumber} · {employee.firstName} {employee.lastName}
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {employee.jobTitle}
          </p>

          <button
            onClick={() => setIsEditDrawerOpen(true)}
            className="text-[11px] font-semibold text-[#0284C7] hover:underline mt-1"
          >
            Edit Profile
          </button>
        </div>

        {/* Live Attendance / Timer Card */}
        <div className="bg-slate-50 rounded-md border border-slate-100 p-3 flex flex-col items-center space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span
              className={`h-2 w-2 rounded-full ${
                liveState.isCheckedIn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span className={liveState.isCheckedIn ? 'text-emerald-700' : 'text-slate-600'}>
              {liveState.isCheckedIn ? 'In' : 'Out'}
            </span>
          </div>

          {/* Timestamp-derived live timer */}
          <div className="text-xl font-bold font-mono tracking-wider text-slate-800">
            {timerDisplay.hrs} : {timerDisplay.mins} : {timerDisplay.secs}
          </div>

          <button
            onClick={handleToggleAttendance}
            className={`w-full py-1.5 px-3 rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer ${
              liveState.isCheckedIn
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                : 'bg-[#0284C7] hover:bg-[#0369A1] text-white'
            }`}
          >
            {liveState.isCheckedIn ? 'Check out' : 'Check in'}
          </button>
        </div>

        {/* Reporting Manager Section */}
        <div className="pt-2 border-t border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Reporting Manager
          </span>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
              {employee.manager.firstName.charAt(0)}
            </div>
            <div className="text-xs">
              <div className="font-semibold text-slate-800 truncate">
                {employee.manager.employeeNumber} · {employee.manager.firstName} {employee.manager.lastName}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                In
              </div>
            </div>
          </div>
        </div>

        {/* Department Members Section */}
        <div className="pt-2 border-t border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Department Members ({employee.departmentMembers.length})
          </span>
          <div className="space-y-2">
            {employee.departmentMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center">
                  {member.firstName.charAt(0)}
                </div>
                <div className="text-xs">
                  <div className="font-medium text-slate-800 truncate">
                    {member.employeeNumber} · {member.firstName} {member.lastName}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    In
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Photo Upload Modal */}
      <PhotoUploadModal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
      />

      {/* Interactive Profile Edit Drawer */}
      <ProfileEditDrawer
        isOpen={isEditDrawerOpen}
        onClose={() => setIsEditDrawerOpen(false)}
      />
    </>
  );
}
