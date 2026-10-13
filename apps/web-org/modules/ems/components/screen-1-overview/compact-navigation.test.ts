import { describe, expect, it } from 'vitest';
import { compactSectionUrl } from './compact-navigation';

describe('compact Home navigation', () => {
  it('writes Overview explicitly when opening My week so the mobile fallback cannot override it', () => {
    expect(compactSectionUrl('Activities', '?space=my-space&module=overview', '/')).toBe(
      '/?space=my-space&module=overview&overviewTab=Overview&overviewSection=Activities',
    );
  });

  it('keeps Profile as the default mobile section while preserving unrelated URL state', () => {
    expect(compactSectionUrl('Profile', '?space=my-space', '/')).toBe(
      '/?space=my-space&overviewTab=Overview',
    );
  });
});
