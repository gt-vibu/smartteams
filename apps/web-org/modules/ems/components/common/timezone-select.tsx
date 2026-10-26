'use client';

import React, { useMemo } from 'react';
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';

const INHERIT = '__inherit__';
const COMMON = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

/** Every timezone the browser knows (IANA names), falling back to the common ones. */
function allZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    return intl.supportedValuesOf?.('timeZone') ?? COMMON;
  } catch {
    return COMMON;
  }
}

/** "GMT+5:30" for a zone, as it is now. */
function offsetOf(zone: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value ?? ''
    );
  } catch {
    return '';
  }
}

const label = (zone: string) => `${zone.replace(/_/g, ' ')} (${offsetOf(zone)})`;

/**
 * A timezone chosen from a list rather than typed: the common ones first, then every IANA zone
 * A to Z, each with its current UTC offset. `inheritLabel` adds a "none" choice (empty value),
 * for a branch that follows its organization.
 */
export function TimezoneSelect({
  value,
  onChange,
  disabled = false,
  inheritLabel,
  id,
}: {
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  inheritLabel?: string;
  id?: string;
}) {
  const zones = useMemo(() => {
    const all = allZones().filter((zone) => !COMMON.includes(zone));
    return [...all].sort((a, b) => a.localeCompare(b));
  }, []);
  const current = value || (inheritLabel ? INHERIT : '');
  const unknown = value && !COMMON.includes(value) && !zones.includes(value);

  return (
    <SelectMenu
      disabled={disabled}
      onValueChange={(next) => onChange(next === INHERIT ? '' : next)}
      value={current}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Choose a timezone" />
      </SelectTrigger>
      <SelectContent>
        {inheritLabel && <SelectItem value={INHERIT}>{inheritLabel}</SelectItem>}
        {unknown && <SelectItem value={value}>{value}</SelectItem>}
        <SelectGroup>
          <SelectLabel>Common</SelectLabel>
          {COMMON.map((zone) => (
            <SelectItem key={zone} value={zone}>
              {label(zone)}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>All timezones</SelectLabel>
          {zones.map((zone) => (
            <SelectItem key={zone} value={zone}>
              {label(zone)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </SelectMenu>
  );
}
