import { describe, expect, it } from 'vitest';
import { statusLabel } from './status-label';

describe('statusLabel', () => {
  it('reads stored codes as words', () => {
    expect(statusLabel('APPROVED')).toBe('Approved');
    expect(statusLabel('HALF_DAY')).toBe('Half day');
    expect(statusLabel('PLANNED')).toBe('Planned');
  });
  it('uses the plain name where the code reads oddly', () => {
    expect(statusLabel('DEACTIVATED')).toBe('Inactive');
    expect(statusLabel('PARTIALLY_RECOVERED')).toBe('Repaying');
  });
  it('leaves words alone and shows a dash for nothing', () => {
    expect(statusLabel('Covering now')).toBe('Covering now');
    expect(statusLabel(null)).toBe('—');
  });
});
