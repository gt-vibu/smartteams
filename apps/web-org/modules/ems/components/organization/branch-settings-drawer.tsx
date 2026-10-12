'use client';

import React, { useEffect, useState } from 'react';
import {
  LoadingIndicator,
  Button,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetTitle,
} from '@smarteam/ui';
import { hasPermission, type Branch, LIMITS, textProblem } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { organizationRepository } from '../../repositories/organization.repository';
import { attendanceRepository } from '../../repositories/attendance.repository';
import { TimezoneSelect } from '../common/timezone-select';
import { pinCodeProblem } from '@smarteam/contracts';

type Location = { name: string; latitude: string; longitude: string; radiusMeters: string };
const ADDRESS = ['line1', 'line2', 'city', 'state', 'postalCode', 'country'] as const;
const ADDRESS_LABEL: Record<(typeof ADDRESS)[number], string> = {
  line1: 'Address line 1',
  line2: 'Address line 2',
  city: 'City',
  state: 'State',
  postalCode: 'PIN code',
  country: 'Country',
};
const INHERIT = '__org__';

/**
 * Everything about one branch: its details (name, code, timezone, address), how attendance works
 * there (geofencing, biometric check, the work locations a geofenced check-in must come from),
 * and how many current employees are based there. Each part saves to the API and is read back.
 */
export function BranchSettingsDrawer({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId ?? '';
  const permissions = persona?.permissions ?? [];
  const canEditBranch = hasPermission(permissions, 'branches.write');
  const canEditAttendance = hasPermission(permissions, 'attendance.preferences.write');
  const overview = useAsyncResource(
    () => organizationRepository.getBranchOverview(organizationId, branch.id),
    [organizationId, branch.id],
    { enabled: Boolean(organizationId) },
  );
  const data = overview.data;

  const [details, setDetails] = useState({ name: '', code: '', timezone: '' });
  const [address, setAddress] = useState<Record<string, string>>({});
  const [geofence, setGeofence] = useState(INHERIT);
  const [biometric, setBiometric] = useState(INHERIT);
  const [locations, setLocations] = useState<Location[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setDetails({ name: data.name, code: data.code, timezone: data.timezone ?? '' });
    const saved = data.address ?? {};
    setAddress(
      Object.fromEntries(
        ADDRESS.map((key) => [key, typeof saved[key] === 'string' ? saved[key] : '']),
      ),
    );
    setGeofence(data.geofenceMode ?? INHERIT);
    setBiometric(data.biometricVerificationMode ?? INHERIT);
    setLocations(
      data.workLocations.map((l) => ({
        name: l.name,
        latitude: String(l.latitude),
        longitude: String(l.longitude),
        radiusMeters: String(l.radiusMeters),
      })),
    );
  }, [data]);

  // An Indian address (or one naming no country) takes a 6-digit PIN code.
  const pin = (address.postalCode ?? '').trim();
  const country = (address.country ?? '').trim();
  const pinError = pin && (!country || /^india$/i.test(country)) ? pinCodeProblem(pin) : null;

  const save = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await overview.refetch();
      onSaved();
      setMessage({ ok: true, text: done });
    } catch (caught) {
      setMessage({ ok: false, text: caught instanceof Error ? caught.message : 'Not saved.' });
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = () =>
    save(
      () =>
        organizationRepository.updateBranch(organizationId, branch.id, {
          name: details.name.trim(),
          code: details.code.trim(),
          timezone: details.timezone.trim(),
          address: Object.fromEntries(
            Object.entries(address).filter(([, value]) => value.trim() !== ''),
          ),
        }),
      'Branch details saved.',
    );

  const locationsValid = locations.every(
    (l) =>
      l.name.trim().length >= 2 &&
      Math.abs(Number(l.latitude)) <= 90 &&
      Math.abs(Number(l.longitude)) <= 180 &&
      Number(l.radiusMeters) >= 1 &&
      [l.latitude, l.longitude, l.radiusMeters].every((v) => v.trim() !== '' && !isNaN(Number(v))),
  );
  const saveAttendance = () =>
    save(
      () =>
        attendanceRepository.updatePreferences(organizationId, {
          branchId: branch.id,
          ...(geofence !== INHERIT ? { geofenceMode: geofence } : {}),
          ...(biometric !== INHERIT ? { biometricVerificationMode: biometric } : {}),
          workLocations: locations.map((l) => ({
            name: l.name.trim(),
            latitude: Number(l.latitude),
            longitude: Number(l.longitude),
            radiusMeters: Number(l.radiusMeters),
          })),
        }),
      'Attendance rules saved.',
    );

  const setLocation = (index: number, key: keyof Location, value: string) =>
    setLocations((all) => all.map((l, i) => (i === index ? { ...l, [key]: value } : l)));

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent className="max-w-lg gap-0 overflow-y-auto p-0">
        <SheetTitle className="border-b border-border bg-muted/40 p-5 pr-14 text-sm font-bold">
          {branch.name}
          <span className="block text-xs font-normal text-muted-foreground">
            {data
              ? `${data.employeeCount} current employee${data.employeeCount === 1 ? '' : 's'}`
              : ''}
          </span>
        </SheetTitle>

        <div className="space-y-6 p-5 text-xs">
          {overview.loading && <LoadingIndicator variant="inline" label="Preparing content" />}
          {overview.error && (
            <p className="text-destructive" role="alert">
              {overview.error}
            </p>
          )}
          {message && (
            <p
              className={message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}
              role="status"
            >
              {message.text}
            </p>
          )}

          {data && (
            <>
              <section className="space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {(['name', 'code'] as const).map((key) => (
                    <div key={key}>
                      <Label className="mb-1 block">{key === 'name' ? 'Name' : 'Code'}</Label>
                      <Input
                        disabled={!canEditBranch || busy}
                        onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
                        value={details[key]}
                      />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <Label className="mb-1 block">Timezone</Label>
                    <TimezoneSelect
                      disabled={!canEditBranch || busy}
                      inheritLabel="Same as the organization"
                      onChange={(timezone) => setDetails({ ...details, timezone })}
                      value={details.timezone}
                    />
                  </div>
                  {ADDRESS.map((key) => (
                    <div className={key.startsWith('line') ? 'col-span-2' : ''} key={key}>
                      <Label className="mb-1 block">{ADDRESS_LABEL[key]}</Label>
                      <Input
                        aria-invalid={(key === 'postalCode' && Boolean(pinError)) || undefined}
                        disabled={!canEditBranch || busy}
                        inputMode={key === 'postalCode' ? 'numeric' : undefined}
                        maxLength={key === 'postalCode' ? 10 : undefined}
                        onChange={(e) => setAddress({ ...address, [key]: e.target.value })}
                        value={address[key] ?? ''}
                      />
                      {key === 'postalCode' && pinError && (
                        <p className="mt-1 text-[11px] text-destructive">{pinError}</p>
                      )}
                    </div>
                  ))}
                </div>
                {canEditBranch && (
                  <Button
                    disabled={
                      busy || details.name.trim().length < 2 || !details.code.trim() || !!pinError
                    }
                    onClick={() => void saveDetails()}
                    size="sm"
                    type="button"
                  >
                    Save details
                  </Button>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Attendance at this branch
                </h3>
                {(
                  [
                    ['Geofencing', geofence, setGeofence, ['DISABLED', 'FLAG_ONLY', 'REQUIRED']],
                    [
                      'Biometric check',
                      biometric,
                      setBiometric,
                      ['DISABLED', 'OPTIONAL', 'REQUIRED'],
                    ],
                  ] as const
                ).map(([label, value, set, options]) => (
                  <div key={label}>
                    <Label className="mb-1 block">{label}</Label>
                    <SelectMenu
                      disabled={!canEditAttendance || busy}
                      onValueChange={set}
                      value={value}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {value === INHERIT && (
                          <SelectItem value={INHERIT}>Same as the organization</SelectItem>
                        )}
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option.charAt(0) + option.slice(1).toLowerCase().replace('_', ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectMenu>
                  </div>
                ))}

                <div className="space-y-2">
                  <Label className="block">Work locations</Label>
                  <p className="text-[11px] text-muted-foreground">
                    With geofencing on, a check-in must come from within the radius of one of these.
                  </p>
                  {locations.length === 0 && (
                    <p className="text-muted-foreground">No work locations yet.</p>
                  )}
                  {locations.map((location, index) => (
                    <div
                      className="grid grid-cols-2 gap-2 rounded-md border border-border p-2"
                      key={index}
                    >
                      <Input
                        maxLength={LIMITS.title}
                        problem={textProblem(location.name, 'Location name', LIMITS.title, 2)}
                        className="col-span-2"
                        disabled={!canEditAttendance || busy}
                        onChange={(e) => setLocation(index, 'name', e.target.value)}
                        placeholder="Name, e.g. Main office"
                        value={location.name}
                      />
                      <Input
                        type="number"
                        min={-90}
                        max={90}
                        step="any"
                        disabled={!canEditAttendance || busy}
                        inputMode="decimal"
                        onChange={(e) => setLocation(index, 'latitude', e.target.value)}
                        placeholder="Latitude"
                        value={location.latitude}
                      />
                      <Input
                        type="number"
                        min={-180}
                        max={180}
                        step="any"
                        disabled={!canEditAttendance || busy}
                        inputMode="decimal"
                        onChange={(e) => setLocation(index, 'longitude', e.target.value)}
                        placeholder="Longitude"
                        value={location.longitude}
                      />
                      <Input
                        type="number"
                        min={10}
                        max={10000}
                        step={1}
                        disabled={!canEditAttendance || busy}
                        inputMode="numeric"
                        onChange={(e) => setLocation(index, 'radiusMeters', e.target.value)}
                        placeholder="Radius in metres"
                        value={location.radiusMeters}
                      />
                      {canEditAttendance && (
                        <Button
                          className="text-destructive"
                          disabled={busy}
                          onClick={() => setLocations((all) => all.filter((_, i) => i !== index))}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  {canEditAttendance && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setLocations((all) => [
                            ...all,
                            { name: '', latitude: '', longitude: '', radiusMeters: '100' },
                          ])
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        + Add location
                      </Button>
                      <Button
                        disabled={busy || !locationsValid}
                        onClick={() => void saveAttendance()}
                        size="sm"
                        type="button"
                      >
                        Save attendance rules
                      </Button>
                    </div>
                  )}
                  {!locationsValid && (
                    <p className="text-[11px] text-destructive">
                      Each location needs a name, a latitude (−90 to 90), a longitude (−180 to 180)
                      and a radius of at least 1 metre.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
