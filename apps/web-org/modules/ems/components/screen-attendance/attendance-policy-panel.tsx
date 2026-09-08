'use client';

import React from 'react';
import {
  Badge,
  Button,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { useAttendancePreferences } from '../../hooks/use-attendance-preferences';

const GEOFENCE_MODES = [
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'FLAG_ONLY', label: 'Flag only' },
  { value: 'REQUIRED', label: 'Required' },
];

const BIOMETRIC_MODES = [
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'REQUIRED', label: 'Required' },
];

const SESSION_MODES = [
  { value: 'SINGLE', label: 'One session per day (Check in & out once)' },
  { value: 'MULTIPLE', label: 'Multiple sessions per day (Multiple check-ins)' },
];

/**
 * Attendance policy: geofencing and biometric verification.
 *
 * Newly built. `POST /attendance/preferences` existed with no screen behind it, and the matching
 * `GET` did not exist at all, so the policy could be written but never read back.
 *
 * The owner-source badges say whether a value is the organization default or a branch override,
 * which the API reports and the UI would otherwise hide.
 */
export function AttendancePolicyPanel() {
  const policy = useAttendancePreferences();

  if (!policy.canRead) {
    return (
      <section className="rounded-lg border border-border bg-card p-4" role="status">
        <p className="text-xs text-muted-foreground">
          You do not have permission to view the attendance policy.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
          Attendance policy
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Applies to how punches are captured and verified.
        </p>
      </header>

      <div className="space-y-4 p-4">
        {policy.loading && (
          <p className="text-xs text-muted-foreground" role="status">
            Loading policy...
          </p>
        )}

        {!policy.loading && policy.error && (
          <p className="text-xs text-destructive" role="alert">
            {policy.error}
          </p>
        )}

        {policy.preferences && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label htmlFor="geofence-mode">Geofencing</Label>
                  <Badge variant="outline">{policy.preferences.geofenceOwnerSource}</Badge>
                </div>
                <SelectMenu
                  disabled={!policy.canWrite || policy.saving}
                  onValueChange={(value) => void policy.save({ geofenceMode: value })}
                  value={policy.preferences.geofenceMode ?? 'DISABLED'}
                >
                  <SelectTrigger id="geofence-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEOFENCE_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label htmlFor="biometric-mode">Biometric verification</Label>
                  <Badge variant="outline">{policy.preferences.biometricOwnerSource}</Badge>
                </div>
                <SelectMenu
                  disabled={!policy.canWrite || policy.saving}
                  onValueChange={(value) => void policy.save({ biometricVerificationMode: value })}
                  value={policy.preferences.biometricVerificationMode ?? 'DISABLED'}
                >
                  <SelectTrigger id="biometric-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BIOMETRIC_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
              </div>

              <div className="sm:col-span-2 border-t border-border pt-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div>
                    <Label htmlFor="session-mode" className="text-xs font-semibold">
                      Attendance Sessions
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Determines whether employees record a single completed shift or multiple
                      clock-ins per day.
                    </p>
                  </div>
                  <Badge variant="outline">Organization Default</Badge>
                </div>
                <SelectMenu
                  disabled={!policy.canWrite || policy.saving}
                  onValueChange={(value) =>
                    void policy.save({ attendanceSessionMode: value as 'SINGLE' | 'MULTIPLE' })
                  }
                  value={policy.preferences.attendanceSessionMode}
                >
                  <SelectTrigger id="session-mode" className="w-full mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SESSION_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
              </div>
            </div>

            {!policy.canWrite && (
              <p className="text-[11px] text-muted-foreground">
                Read-only &mdash; you cannot change the attendance policy.
              </p>
            )}

            {policy.saveError && (
              <p className="text-xs font-semibold text-destructive" role="alert">
                {policy.saveError}
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Work locations are stored per branch by the API but are not editable here yet.
            </p>

            <Button
              disabled={policy.loading}
              onClick={() => void policy.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Refresh
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
