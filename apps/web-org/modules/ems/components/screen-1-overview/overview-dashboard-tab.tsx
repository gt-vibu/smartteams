import { Button, LoadingIndicator } from '@smarteam/ui';
import React from 'react';
import { useAttendance } from '../../hooks/use-attendance';
import { useTimesheet } from '../../hooks/use-timesheet';
import { useLeave } from '../../hooks/use-leave';
import { useAuth } from '../../hooks/use-auth';
import { useMyShift } from '../../hooks/use-my-shift';
import { ProjectHoursCard } from './project-hours-card';

interface OverviewDashboardTabProps {
  onNavigateModule?: (module: string, subView?: 'timeline' | 'table' | 'calendar') => void;
  compactStatsOnly?: boolean;
}

export function OverviewDashboardTab({
  onNavigateModule,
  compactStatsOnly = false,
}: OverviewDashboardTabProps) {
  // Links follow the same access rule as the navigation, so Home never offers a screen the
  // workspace would refuse (an HR role reaches Approvals from the HR workspace, not from here).
  const { canAccessModule } = useAuth();
  const { days: records } = useAttendance();
  const { summary } = useTimesheet();
  const { balances, types } = useLeave();
  const myShift = useMyShift();

  const presentCount = records.filter((r) => r.dayStatus === 'PRESENT').length;
  const totalDays = records.length;
  // No days recorded is shown as no rate, never as a perfect 100%.
  const attendanceRate = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : null;

  const totalLeaveAvailable = balances.reduce((sum, b) => sum + b.availableAmount, 0);
  // The leave types this person actually has balances in, not a fixed list.
  const leaveTypeNames = [
    ...new Set(
      balances
        .map((balance) => types.find((type) => type.id === balance.leaveTypeId)?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  return (
    <div className="space-y-4">
      {/* 1. Executive Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-4">
        <DashboardStatCard
          allowed={canAccessModule('attendance')}
          onClick={() => onNavigateModule?.('attendance')}
        >
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Attendance Rate</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
              Last 30 days
            </span>
          </div>
          <div className="text-xl font-bold text-foreground mt-2">
            {attendanceRate === null ? '—' : `${attendanceRate}%`}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {totalDays === 0
              ? 'No attendance recorded yet'
              : `Present ${presentCount} of ${totalDays} recorded days`}
          </p>
        </DashboardStatCard>

        <DashboardStatCard
          allowed={canAccessModule('timesheet')}
          onClick={() => onNavigateModule?.('timesheet')}
        >
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Hours Logged</span>
            <span className="text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
              Timesheet
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-foreground mt-2">
            {summary.totalLabel}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {summary.submittedLabel} submitted, {summary.notSubmittedLabel} pending
          </p>
        </DashboardStatCard>

        <DashboardStatCard
          allowed={canAccessModule('time-off')}
          onClick={() => onNavigateModule?.('time-off')}
        >
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Leave Balance</span>
            <span className="text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
              Available
            </span>
          </div>
          <div className="text-xl font-bold text-foreground mt-2">{totalLeaveAvailable} Days</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {leaveTypeNames.length
              ? `Across ${leaveTypeNames.join(', ')}`
              : 'No leave balances yet'}
          </p>
        </DashboardStatCard>

        <DashboardStatCard
          allowed={canAccessModule('shifts')}
          onClick={() => onNavigateModule?.('shifts')}
        >
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Today&apos;s Shift</span>
          </div>
          <div className="text-sm font-bold text-foreground mt-2">
            {myShift.shift
              ? myShift.shift.name
              : myShift.loading
                ? <LoadingIndicator variant="inline" label="Loading your shift" />
                : myShift.error
                  ? 'Could not load'
                  : 'No shift assigned'}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {myShift.shift
              ? `${myShift.shift.startsAt} - ${myShift.shift.endsAt}`
              : 'From your shift assignment'}
          </p>
        </DashboardStatCard>
      </div>

      {/* 2. Project Allocation & Quick Jump Actions */}
      {!compactStatsOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <ProjectHoursCard />

          {/* Quick Navigate Actions */}
          <div className="lg:col-span-5 bg-card rounded-[6px] border border-border p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-foreground">Quick links</h4>
            <div className="space-y-2 text-xs">
              {quickLinks
                .filter((link) => canAccessModule(link.module))
                .map((link) => (
                  <Button
                    key={link.label}
                    onClick={() => onNavigateModule?.(link.module, link.view)}
                    className="w-full p-2.5 bg-muted/40 hover:bg-sky-50 border border-border hover:border-sky-300 rounded text-left flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-foreground">{link.label}</div>
                    <span className="text-sky-600 font-bold text-[11px]">Go →</span>
                  </Button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardStatCard({
  allowed,
  onClick,
  children,
}: {
  allowed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const className =
    'w-full rounded-[6px] border border-border bg-card p-3 text-left shadow-xs transition-colors sm:p-4';
  return allowed ? (
    <button
      className={`${className} hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  );
}

const quickLinks: ReadonlyArray<{ label: string; module: string; view?: 'timeline' | 'calendar' }> =
  [
    { label: 'Attendance timeline', module: 'attendance', view: 'timeline' },
    { label: 'Attendance calendar', module: 'attendance', view: 'calendar' },
    { label: 'Log time', module: 'timesheet' },
    { label: 'Apply for leave', module: 'time-off' },
    { label: 'Approvals', module: 'approvals' },
  ];
