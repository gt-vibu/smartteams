import { describe, expect, it } from 'vitest';
import { localDateKey, localDateKeyIn } from './local-date';

describe('localDateKey', () => {
  it('names the local day a date was built on, in any timezone', () => {
    // `toISOString()` gave 2026-09-30 for this in India: local midnight is 18:30 UTC the day before.
    expect(localDateKey(new Date(2026, 9, 1))).toBe('2026-10-01');
    expect(localDateKey(new Date(2026, 9, 1, 23, 59))).toBe('2026-10-01');
    expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('counts days from today on the local calendar', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(localDateKeyIn(1)).toBe(localDateKey(tomorrow));
    expect(localDateKeyIn(0)).toBe(localDateKey());
  });
});
