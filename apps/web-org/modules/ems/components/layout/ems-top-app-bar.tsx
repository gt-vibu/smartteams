'use client';

import React, { useState } from 'react';
import { useEmployee } from '../../hooks/use-employee';
import { PhotoUploadModal } from '../profile/photo-upload-modal';

interface EmsTopAppBarProps {
  activeSpace: string;
  onSelectSpace: (space: string) => void;
}

export function EmsTopAppBar({ activeSpace, onSelectSpace }: EmsTopAppBarProps) {
  const spaces = ['My Space', 'Team', 'Organization'];
  const { employee } = useEmployee();
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  return (
    <>
      <header className="h-12 w-full bg-[#0F172A] border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between z-40 sticky top-0 shrink-0">
        {/* Left: Smarteam Brand + Primary Space Selector */}
        <div className="flex items-center space-x-3 sm:space-x-6 min-w-0">
          {/* Brand Logo */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="h-7 w-7 rounded-[5px] bg-[#0284C7] flex items-center justify-center text-white shadow-sm">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-white tracking-tight hidden xs:inline">
              Smarteam
            </span>
          </div>

          {/* Primary Space Selector (Desktop & Tablet) */}
          <nav className="hidden sm:flex items-center space-x-1 bg-slate-800/50 p-1 rounded-md border border-slate-700/60 shrink-0">
            {spaces.map((space) => {
              const isActive = activeSpace === space;
              return (
                <button
                  key={space}
                  onClick={() => onSelectSpace(space)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-700/90 text-white font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
                  }`}
                >
                  {space}
                </button>
              );
            })}
          </nav>

          {/* Mobile Space Selector Dropdown (Hidden on Desktop) */}
          <div className="sm:hidden relative">
            <select
              value={activeSpace}
              onChange={(e) => onSelectSpace(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs font-semibold rounded px-2 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
            >
              {spaces.map((space) => (
                <option key={space} value={space}>
                  {space}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Quick Action, Global Search, Notification Bell, User Avatar */}
        <div className="flex items-center space-x-2 sm:space-x-3 text-slate-300 shrink-0">
          {/* Quick Create + Action */}
          <button
            className="h-7 w-7 rounded bg-[#0284C7] hover:bg-[#0369A1] text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
            title="Quick Action"
            aria-label="Quick Action"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Search Icon */}
          <button
            className="p-1.5 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
            title="Search"
            aria-label="Search"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Notification Bell */}
          <button
            className="p-1.5 hover:text-white hover:bg-slate-800 rounded transition-colors relative cursor-pointer"
            title="Notifications"
            aria-label="Notifications"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 h-1.5 w-1.5 bg-sky-400 rounded-full" />
          </button>

          {/* User Avatar with Photo Upload Trigger */}
          <button
            onClick={() => setIsPhotoModalOpen(true)}
            className="h-7 w-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-white hover:border-sky-400 transition-colors overflow-hidden cursor-pointer"
            title="Click to update photo"
            aria-label="User Profile Photo"
          >
            {employee.avatarUrl ? (
              <img src={employee.avatarUrl} alt={employee.firstName} className="h-full w-full object-cover" />
            ) : (
              <span>{employee.firstName.charAt(0)}</span>
            )}
          </button>
        </div>
      </header>

      <PhotoUploadModal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
      />
    </>
  );
}

