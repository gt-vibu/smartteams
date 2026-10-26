'use client';

import React, { useEffect, useState } from 'react';
import {
  LoadingIndicator,
  Badge,
  Button,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { useAttendancePreferences } from '../../hooks/use-attendance-preferences';
import { AutoCheckOutSection } from './auto-check-out-section';
import { LateRulesSection } from './late-rules-section';
import { captureAttendanceLocation } from '../../services/attendance-location';
import { useOrganization } from '../../hooks/use-organization';

type LocationDraft = { name: string; latitude: string; longitude: string };
type LocationMethod = 'CURRENT' | 'MANUAL' | 'UNSET';

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
  const organization = useOrganization();
  const policy = useAttendancePreferences();
  const activeBranches = organization.branches.filter((branch) => branch.status !== 'DEACTIVATED');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  useEffect(() => {
    if (!activeBranches.length) {
      setSelectedBranchId('');
      return;
    }
    if (!activeBranches.some((branch) => branch.id === selectedBranchId))
      setSelectedBranchId(
        activeBranches.find((branch) => branch.id === organization.primaryBranchId)?.id ??
          activeBranches[0]?.id ??
          '',
      );
  }, [activeBranches, organization.primaryBranchId, selectedBranchId]);
  const selectedBranch = activeBranches.find((branch) => branch.id === selectedBranchId) ?? null;
  const branchPolicy = useAttendancePreferences(selectedBranch?.id);
  const [locations, setLocations] = useState<LocationDraft[]>([]);
  const [locationMethods, setLocationMethods] = useState<LocationMethod[]>([]);
  const [locationsDirty, setLocationsDirty] = useState(false);
  const [pendingGeofenceMode, setPendingGeofenceMode] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [capturingLocation, setCapturingLocation] = useState<number | null>(null);

  useEffect(() => {
    if (locationsDirty || !branchPolicy.preferences) return;
    setLocations(
      (branchPolicy.preferences.workLocations ?? []).slice(0, 1).map((location) => ({
        name: location.name,
        latitude: String(location.latitude),
        longitude: String(location.longitude),
      })),
    );
    setLocationMethods(
      (branchPolicy.preferences.workLocations ?? []).slice(0, 1).map(() => 'UNSET'),
    );
  }, [locationsDirty, branchPolicy.preferences]);

  useEffect(() => {
    const mode = branchPolicy.preferences?.geofenceMode;
    if (
      !selectedBranch ||
      locationsDirty ||
      !mode ||
      mode === 'DISABLED' ||
      branchPolicy.preferences?.workLocations?.length
    )
      return;
    setLocations([{ name: `${selectedBranch.name} main location`, latitude: '', longitude: '' }]);
    setLocationMethods(['UNSET']);
    setLocationsDirty(true);
    setPendingGeofenceMode(mode);
  }, [branchPolicy.preferences, locationsDirty, selectedBranch]);

  const markLocationsDirty = (next: LocationDraft[]) => {
    setLocations(next);
    setLocationsDirty(true);
    setLocationMessage(null);
  };

  const updateLocation = (index: number, key: keyof LocationDraft, value: string) =>
    markLocationsDirty(
      locations.map((location, itemIndex) =>
        itemIndex === index ? { ...location, [key]: value } : location,
      ),
    );

  const useCurrentLocation = async (index: number) => {
    setCapturingLocation(index);
    setLocationMessage(null);
    try {
      const current = await captureAttendanceLocation();
      markLocationsDirty(
        locations.map((location, itemIndex) =>
          itemIndex === index
            ? {
                ...location,
                latitude: String(current.latitude),
                longitude: String(current.longitude),
              }
            : location,
        ),
      );
      setLocationMethods((methods) => {
        const next = [...methods];
        next[index] = 'CURRENT';
        return next;
      });
      setLocationMessage({
        text: 'Location captured. Save the attendance policy to use it as a work location.',
        ok: true,
      });
    } catch (caught) {
      setLocationMessage({
        text: caught instanceof Error ? caught.message : 'Unable to get this device’s location.',
        ok: false,
      });
    } finally {
      setCapturingLocation(null);
    }
  };

  const saveGeofence = async () => {
    const valid =
      locations.length > 0 &&
      locations.every((location, index) => {
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        return (
          locationMethods[index] !== 'UNSET' &&
          location.name.trim().length >= 2 &&
          location.latitude.trim() !== '' &&
          location.longitude.trim() !== '' &&
          Number.isFinite(latitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          Number.isFinite(longitude) &&
          longitude >= -180 &&
          longitude <= 180
        );
      });
    if (!valid) {
      setLocationMessage({
        text: 'Add a location name and valid latitude and longitude before saving.',
        ok: false,
      });
      return;
    }
    if (!selectedBranch) return;
    const saved = await branchPolicy.save({
      ...(pendingGeofenceMode ? { geofenceMode: pendingGeofenceMode } : {}),
      workLocations: locations.map((location) => ({
        name: location.name.trim(),
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        radiusMeters: 100,
      })),
    });
    if (saved) {
      setPendingGeofenceMode(null);
      setLocationsDirty(false);
      setLocationMessage({
        text: `${selectedBranch.name} location saved. Employees assigned to it must be within 100 metres.`,
        ok: true,
      });
    }
  };

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
          <LoadingIndicator
            variant="inline"
            label="Loading policy"
            className="text-xs text-muted-foreground"
          />
        )}

        {!policy.loading && policy.error && (
          <p className="text-xs text-destructive" role="alert">
            {policy.error}
          </p>
        )}

        {policy.preferences && (
          <>
            <div className="max-w-xl">
              <Label htmlFor="geofence-branch">Branch for attendance location</Label>
              {organization.branchesForbidden ? (
                <p className="mt-1 text-xs text-destructive">
                  You need branch access to configure attendance locations.
                </p>
              ) : activeBranches.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Create an active branch in Organization setup before enabling geofencing.
                </p>
              ) : (
                <SelectMenu
                  value={selectedBranchId}
                  onValueChange={(value) => {
                    setSelectedBranchId(value);
                    setLocations([]);
                    setLocationMethods([]);
                    setLocationsDirty(false);
                    setPendingGeofenceMode(null);
                    setLocationMessage(null);
                  }}
                >
                  <SelectTrigger id="geofence-branch">
                    <SelectValue placeholder="Choose branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBranches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label htmlFor="geofence-mode">Geofencing</Label>
                  <Badge variant="outline">
                    {branchPolicy.preferences?.geofenceOwnerSource ?? 'Branch'}
                  </Badge>
                </div>
                <SelectMenu
                  disabled={
                    !branchPolicy.canWrite ||
                    branchPolicy.saving ||
                    branchPolicy.loading ||
                    !selectedBranch
                  }
                  onValueChange={(value) => {
                    setLocationMessage(null);
                    if (value !== 'DISABLED' && !branchPolicy.preferences?.workLocations?.length) {
                      setPendingGeofenceMode(value);
                      if (!locations.length)
                        markLocationsDirty([
                          {
                            name: `${selectedBranch?.name ?? 'Branch'} main location`,
                            latitude: '',
                            longitude: '',
                          },
                        ]);
                      if (!locationMethods.length) setLocationMethods(['UNSET']);
                      return;
                    }
                    setPendingGeofenceMode(null);
                    void branchPolicy.save({ geofenceMode: value });
                  }}
                  value={
                    pendingGeofenceMode ?? branchPolicy.preferences?.geofenceMode ?? 'DISABLED'
                  }
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

              {(branchPolicy.preferences?.geofenceMode !== 'DISABLED' || pendingGeofenceMode) &&
                selectedBranch && (
                  <div className="space-y-3 border-t border-border pt-3 sm:col-span-2">
                    <div>
                      <h4 className="text-xs font-semibold text-foreground">
                        {selectedBranch.name} attendance location
                      </h4>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Employees assigned to this branch must be within 100 metres of its saved
                        location when checking in or out.
                      </p>
                    </div>

                    {pendingGeofenceMode && locations.length === 0 && (
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <p className="text-xs font-semibold">
                          Choose how to set the company location
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Use this device while you are at the workplace, or enter the coordinates
                          manually.
                        </p>
                      </div>
                    )}

                    {locations.map((location, index) => (
                      <div className="space-y-2 rounded-md border border-border p-3" key={index}>
                        <div className="flex items-center justify-between gap-2">
                          <Label>Branch coordinates</Label>
                          {!locationsDirty && (
                            <span className="text-xs text-muted-foreground">Saved location</span>
                          )}
                        </div>
                        <p className="text-sm font-medium">
                          {location.latitude}, {location.longitude}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={
                              !branchPolicy.canWrite ||
                              branchPolicy.saving ||
                              capturingLocation !== null
                            }
                            onClick={() => void useCurrentLocation(index)}
                            size="sm"
                            type="button"
                            variant={locationMethods[index] === 'CURRENT' ? 'default' : 'outline'}
                          >
                            {capturingLocation === index
                              ? 'Getting location…'
                              : 'Use this device’s current location'}
                          </Button>
                          <Button
                            disabled={!branchPolicy.canWrite || branchPolicy.saving}
                            onClick={() => {
                              setLocationsDirty(true);
                              setLocationMethods((methods) => {
                                const next = [...methods];
                                next[index] = 'MANUAL';
                                return next;
                              });
                              setLocationMessage(null);
                            }}
                            size="sm"
                            type="button"
                            variant={locationMethods[index] === 'MANUAL' ? 'default' : 'outline'}
                          >
                            Enter coordinates manually
                          </Button>
                        </div>
                        {locationMethods[index] === 'MANUAL' || locationsDirty ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              disabled={!branchPolicy.canWrite || branchPolicy.saving}
                              inputMode="decimal"
                              max={90}
                              min={-90}
                              onChange={(event) =>
                                updateLocation(index, 'latitude', event.target.value)
                              }
                              placeholder="Latitude (−90 to 90)"
                              type="number"
                              value={location.latitude}
                            />
                            <Input
                              disabled={!branchPolicy.canWrite || branchPolicy.saving}
                              inputMode="decimal"
                              max={180}
                              min={-180}
                              onChange={(event) =>
                                updateLocation(index, 'longitude', event.target.value)
                              }
                              placeholder="Longitude (−180 to 180)"
                              type="number"
                              value={location.longitude}
                            />
                          </div>
                        ) : locationMethods[index] === 'CURRENT' ? (
                          <p className="text-[11px] text-muted-foreground" role="status">
                            Device location captured: {location.latitude}, {location.longitude}
                          </p>
                        ) : null}
                      </div>
                    ))}

                    {branchPolicy.canWrite && (
                      <div className="flex flex-wrap gap-2">
                        {!locationsDirty && locations.length > 0 && (
                          <Button
                            disabled={branchPolicy.saving}
                            onClick={() => {
                              setLocationsDirty(true);
                              setLocationMethods(['MANUAL']);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Edit branch location
                          </Button>
                        )}
                        <Button
                          disabled={branchPolicy.saving || locations.length === 0}
                          onClick={() => void saveGeofence()}
                          size="sm"
                          type="button"
                        >
                          {branchPolicy.saving
                            ? 'Saving…'
                            : pendingGeofenceMode
                              ? 'Save location and enable geofencing'
                              : 'Save branch location'}
                        </Button>
                        {pendingGeofenceMode && (
                          <Button
                            disabled={branchPolicy.saving}
                            onClick={() => {
                              setPendingGeofenceMode(null);
                              setLocationsDirty(false);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                    {(locationMessage || branchPolicy.saveError) && (
                      <p
                        className={
                          locationMessage?.ok
                            ? 'text-xs text-emerald-700 dark:text-emerald-400'
                            : 'text-xs text-destructive'
                        }
                        role={locationMessage?.ok ? 'status' : 'alert'}
                      >
                        {locationMessage?.text ?? branchPolicy.saveError}
                      </p>
                    )}
                  </div>
                )}

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

            <AutoCheckOutSection policy={policy} />

            <LateRulesSection canWrite={policy.canWrite} />

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
