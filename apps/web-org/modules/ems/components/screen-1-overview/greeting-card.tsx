import React from 'react';
import type { EmployeeProfile } from '../../types/employee.types';

interface GreetingCardProps {
  employee: EmployeeProfile;
}

export function GreetingCard({ employee }: GreetingCardProps) {
  return (
    <div className="bg-white dark:bg-card rounded-lg border border-slate-200/90 dark:border-border p-4 sm:p-5 shadow-xs flex items-center justify-between gap-3 w-full min-w-0">
      <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
        {/* Org Logo Mark */}
        <div className="hidden sm:flex items-center gap-2 pr-4 sm:pr-6 border-r border-slate-200 dark:border-slate-700 shrink-0">
          <div className="h-6 w-6 rounded bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-xs">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
            smarteam
          </span>
        </div>

        {/* Greeting Message */}
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug m-0 break-words">
            Good Afternoon{' '}
            <span className="text-slate-900 dark:text-white">
              {employee.firstName} {employee.lastName}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Have a productive day!
          </p>
        </div>
      </div>

      {/* Decorative Sun Illustration */}
      <div className="h-10 w-10 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-700/50 flex items-center justify-center text-amber-500 dark:text-amber-400 shadow-inner">
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
        </svg>
      </div>
    </div>
  );
}
