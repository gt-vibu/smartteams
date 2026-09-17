/**
 * Turning what someone typed into Hours into HH:MM.
 *
 * Decimal hours used to round the minutes on their own, so 8.999 became "08:60" — a time that does
 * not exist. Minutes are now rounded as a whole before being split into hours and minutes.
 */
import { describe, expect, it } from 'vitest';
import { normalizeTimeInput } from './logtime-hours-field';

describe('normalizeTimeInput', () => {
  it('carries rounded minutes into the hour instead of printing 60', () => {
    expect(normalizeTimeInput('8.999')).toBe('09:00');
    expect(normalizeTimeInput('1.9999')).toBe('02:00');
  });

  it('reads decimal hours', () => {
    expect(normalizeTimeInput('8.5')).toBe('08:30');
    expect(normalizeTimeInput('2.25')).toBe('02:15');
  });

  it('reads colon and digit forms', () => {
    expect(normalizeTimeInput('2:30')).toBe('02:30');
    expect(normalizeTimeInput('830')).toBe('08:30');
    expect(normalizeTimeInput('8')).toBe('08:00');
  });

  it('treats nothing typed as zero, which the form then refuses to save', () => {
    expect(normalizeTimeInput('')).toBe('00:00');
  });
});
