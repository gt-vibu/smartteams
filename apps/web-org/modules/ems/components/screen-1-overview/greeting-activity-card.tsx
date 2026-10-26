'use client';

import React from 'react';
import { Brand } from '@smarteam/ui';
import { ProfileState } from '../profile/profile-state';
import { useEmployee } from '../../hooks/use-employee';
import { formatWorkMinutes, formatDate } from '@smarteam/contracts';
import { useTimesheet } from '../../hooks/use-timesheet';
import { greetingFor } from '../../utils/formatters';

export function GreetingActivityCard() {
  // Hooks first, unconditionally: an account can gain an employee record while this is mounted
  // (an administrator enrolling themselves), flipping the branch below from the "no profile"
  // state to real content. A hook after that branch would only appear on the later render.
  const { employee, loading, error, forbidden, hasEmployeeRecord, refetch } = useEmployee();
  const { approvedTimesheet } = useTimesheet();

  const state = ProfileState({ loading, error, forbidden, hasEmployeeRecord, onRetry: refetch });
  if (state || !employee) return state;

  return (
    <div className="space-y-3">
      {/* Greeting Banner */}
      <div className="bg-card rounded-[6px] border border-border/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div>
            <Brand compact className="mb-2 [&>span:first-child]:size-8 [&>span:first-child]:rounded-md [&>span:first-child>svg]:size-4 [&>span:last-child>span]:text-xs" />
            <h2 className="!text-sm !font-bold !text-foreground !m-0">
              {greetingFor(new Date())}, {employee.firstName}
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Have a productive day!
            </p>
          </div>
        </div>
      </div>

      {/* Timesheet Approval Notice */}
      {approvedTimesheet && (
        <div className="bg-card rounded-[6px] border border-border/90 p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="text-xs">
            <div className="text-foreground">
              Your timesheet —{' '}
              <strong className="text-foreground font-semibold">
                Timesheet ({formatDate(approvedTimesheet.period?.periodStart)} -{' '}
                {formatDate(approvedTimesheet.period?.periodEnd)})
              </strong>{' '}
              has been approved.
            </div>
            <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
              Total: {formatWorkMinutes(approvedTimesheet.totalMinutes)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
