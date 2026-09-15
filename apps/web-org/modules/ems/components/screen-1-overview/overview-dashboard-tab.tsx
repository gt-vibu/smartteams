import { Button } from '@smarteam/ui';
import React from 'react';
import { useAttendance } from '../../hooks/use-attendance';
import { useTimesheet } from '../../hooks/use-timesheet';
import { useLeave } from '../../hooks/use-leave';
import { useAuth } from '../../hooks/use-auth';
import { useMyShift } from '../../hooks/use-my-shift';

interface OverviewDashboardTabProps {
  onNavigateModule?: (module: string, subView?: 'timeline' | 'table' | 'calendar') => void;
}

export function OverviewDashboardTab({ onNavigateModule }: OverviewDashboardTabProps) {
  const { persona, hasPermission } = useAuth();
  const isAdmin = hasPermission('*') || persona.badge.includes('Admin');
  const { days: records } = useAttendance();
  const { summary } = useTimesheet();
  const { balances } = useLeave();
  const myShift = useMyShift();

  const presentCount = records.filter((r) => r.dayStatus === 'PRESENT').length;
  const totalDays = records.length;
  const attendanceRate = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 100;

  const totalLeaveAvailable = balances.reduce((sum, b) => sum + b.availableAmount, 0);

  return (
    <div className="space-y-4">
      {/* 1. Executive Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-card rounded-[6px] border border-border p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Attendance Rate</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
              This Month
            </span>
          </div>
          <div className="text-xl font-bold text-foreground mt-2">{attendanceRate}%</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {presentCount} of {totalDays} work days recorded
          </p>
        </div>

        <div className="bg-card rounded-[6px] border border-border p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Hours Logged</span>
            <span className="text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
              Timesheet
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-foreground mt-2">
            {summary.totalLabel}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {summary.submittedLabel} submitted, {summary.notSubmittedLabel} pending
          </p>
        </div>

        <div className="bg-card rounded-[6px] border border-border p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Leave Balance</span>
            <span className="text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
              Available
            </span>
          </div>
          <div className="text-xl font-bold text-foreground mt-2">{totalLeaveAvailable} Days</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Across Casual, Sick, and Earned Leaves
          </p>
        </div>

        <div className="bg-card rounded-[6px] border border-border p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Today&apos;s Shift</span>
          </div>
          <div className="text-sm font-bold text-foreground mt-2">
            {myShift.shift
              ? myShift.shift.name
              : myShift.loading
                ? 'Loading…'
                : myShift.error
                  ? 'Could not load'
                  : 'No shift assigned'}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {myShift.shift
              ? `${myShift.shift.startsAt} - ${myShift.shift.endsAt}`
              : 'From your shift assignment'}
          </p>
        </div>
      </div>

      {/* 2. Project Allocation & Quick Jump Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Project Hours Distribution */}
        <div className="lg:col-span-7 bg-card rounded-[6px] border border-border p-5 shadow-xs space-y-4">
          <h4 className="text-xs font-bold text-foreground">Project Hours Distribution</h4>
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between font-medium text-foreground mb-1">
                <span>Luxasia 2026 (Client Project)</span>
                <span className="font-mono font-semibold">24.5 Hrs (65%)</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: '65%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-medium text-foreground mb-1">
                <span>Internal Architecture & Automation</span>
                <span className="font-mono font-semibold">9.0 Hrs (25%)</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '25%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-medium text-foreground mb-1">
                <span>Learning & Knowledge Sharing</span>
                <span className="font-mono font-semibold">3.5 Hrs (10%)</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full" style={{ width: '10%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Navigate Actions */}
        <div className="lg:col-span-5 bg-card rounded-[6px] border border-border p-5 shadow-xs space-y-3">
          <h4 className="text-xs font-bold text-foreground">Quick Module Navigation</h4>
          <div className="space-y-2 text-xs">
            <Button
              onClick={() => onNavigateModule?.('attendance', 'timeline')}
              className="w-full p-2.5 bg-muted/40 hover:bg-sky-50 border border-border hover:border-sky-300 rounded text-left flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="font-semibold text-foreground">View Attendance Timeline</div>
              <span className="text-sky-600 font-bold text-[11px]">Go →</span>
            </Button>
            <Button
              onClick={() => onNavigateModule?.('attendance', 'calendar')}
              className="w-full p-2.5 bg-muted/40 hover:bg-sky-50 border border-border hover:border-sky-300 rounded text-left flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="font-semibold text-foreground">Open Shift & Month Calendar</div>
              <span className="text-sky-600 font-bold text-[11px]">Go →</span>
            </Button>
            <Button
              onClick={() => onNavigateModule?.('timesheet')}
              className="w-full p-2.5 bg-muted/40 hover:bg-sky-50 border border-border hover:border-sky-300 rounded text-left flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="font-semibold text-foreground">Log & Submit Timesheets</div>
              <span className="text-sky-600 font-bold text-[11px]">Go →</span>
            </Button>
            {isAdmin ? (
              <Button
                onClick={() => onNavigateModule?.('approvals')}
                className="w-full p-2.5 bg-muted/40 hover:bg-sky-50 border border-border hover:border-sky-300 rounded text-left flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="font-semibold text-foreground">Review Managerial Approvals</div>
                <span className="text-sky-600 font-bold text-[11px]">Go →</span>
              </Button>
            ) : (
              <Button
                onClick={() => onNavigateModule?.('time-off')}
                className="w-full p-2.5 bg-muted/40 hover:bg-sky-50 border border-border hover:border-sky-300 rounded text-left flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="font-semibold text-foreground">Apply for Time Off / Leave</div>
                <span className="text-sky-600 font-bold text-[11px]">Go →</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
