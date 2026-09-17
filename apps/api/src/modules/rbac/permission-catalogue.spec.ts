import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PERMISSION_CATALOGUE } from '@smarteam/contracts';

/**
 * The permission catalogue offers every key the API enforces.
 *
 * `PERMISSION_CATALOGUE` is what the Access Control screen lets an administrator put into a custom
 * role. It had drifted: the payroll run transitions (`approve`, `release`, `lock`, `void`) and the
 * `.read.all` breadth keys for salary profiles, advances and payments were enforced but absent, so
 * no custom role could be given them — only the wildcard could approve or release payroll.
 *
 * This reads the keys straight from the `requirePermission` calls and the breadth markers passed to
 * the self-scope helpers, the same way the catalogue says it was built.
 */

/** Keys enforced deliberately outside the tenant catalogue, and why. */
const NOT_GRANTABLE: Record<string, string> = {
  // Moving an organization between native and federated operation; a wildcard-only act.
  'organizations.source_change': 'wildcard only',
  // The platform console's own permission, not a tenant role's.
  'platform.admin': 'platform RBAC',
};

const SOURCE_ROOT = join(__dirname, '..', '..');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Generated Prisma code, and federation scopes, which are a separate catalogue.
      if (entry !== 'generated' && entry !== 'federation') sourceFiles(full, found);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

const KEY = `'([a-z][a-z-]*(?:\\.[a-z_-]+){1,4})'`;
const ENFORCEMENT = [
  new RegExp(`requirePermission\\(\\s*context,\\s*${KEY}`, 'g'),
  new RegExp(
    `(?:canActForAllEmployees|resolveActingEmployeeId|assertMayActForEmployee)\\([^)]*?${KEY}\\s*\\)`,
    'g',
  ),
  new RegExp(`\\?\\s*${KEY}\\s*:`, 'g'),
];

function enforcedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of ENFORCEMENT) {
      for (const match of text.matchAll(pattern)) {
        const key = match[1];
        if (key && !keys.has(key)) keys.set(key, relative(SOURCE_ROOT, file).split(sep).join('/'));
      }
    }
  }
  return keys;
}

describe('permission catalogue', () => {
  const catalogue = new Set(PERMISSION_CATALOGUE.map((entry) => entry.key));
  const enforced = enforcedKeys();

  it('finds the enforcement points it is meant to read', () => {
    // Guards the scan itself: a regex that matched nothing would pass the test below vacuously.
    expect(enforced.get('payroll.runs.approve')).toBe('modules/payroll/payroll-calculation.ts');
    expect(enforced.has('leave.requests.read.all')).toBe(true);
    expect(enforced.size).toBeGreaterThan(60);
  });

  it('offers every key the API enforces', () => {
    const missing = [...enforced]
      .filter(([key]) => !catalogue.has(key) && !(key in NOT_GRANTABLE))
      .map(([key, file]) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });

  it('lists each key once', () => {
    expect(catalogue.size).toBe(PERMISSION_CATALOGUE.length);
  });
});
