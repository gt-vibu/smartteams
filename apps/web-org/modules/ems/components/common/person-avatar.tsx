'use client';

import React from 'react';

/**
 * Someone's initials in a tinted square.
 *
 * No avatar image is stored against an employee, so this is not a placeholder for a photo that
 * will arrive later — it is the representation. What it has to do is make a row of people
 * scannable, which plain text in a table does not: every row reads identically and finding a
 * name means reading all of them.
 *
 * The tint is derived from the name rather than assigned, so a person keeps the same colour
 * everywhere they appear — the directory, a department, the reporting tree — and the eye can
 * follow them between views. Five theme tones, so it stays a quiet category mark rather than
 * turning a staff list into confetti.
 */

const TONES = [
  'bg-primary/10 text-primary',
  'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/10 text-amber-600 dark:text-amber-500',
  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
] as const;

const SIZES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
} as const;

export function PersonAvatar({ name, size = 'md' }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-lg font-bold ${SIZES[size]} ${toneFor(name)}`}
    >
      {initialsOf(name)}
    </span>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Stable across renders and across screens: the same name always lands on the same tone. */
export function toneFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 1_000_003;
  return TONES[hash % TONES.length] ?? TONES[0];
}
