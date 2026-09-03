import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A guard against fixtures creeping back into reconciled modules.
 *
 * This exists because `use-teams.ts` was once found rewritten with `teams.json` and a
 * `localStorage` fallback restored — including a branch that returned every fixture team when
 * the API returned none, which would make an empty tenant look populated and an API failure look
 * like real data. A regression like that is invisible in review and catastrophic in production,
 * so it fails the build instead.
 *
 * Modules still awaiting reconciliation are deliberately not covered; add them here as each one
 * is wired.
 */

const MODULE_ROOT = join(__dirname, '..');

/** Fixtures that must not appear anywhere in the runtime any more. */
const RETIRED_FIXTURES = [
  'employees.json',
  'teams.json',
  'projects.json',
  'attendance.json',
  'attendance-records.json',
  'employee.fixtures',
  'attendance.fixtures',
  'attendance-table.fixtures',
  'attendance-timeline.fixtures',
  'leave.json',
  'leave-policies.json',
  'leave.fixtures',
  'timesheets.json',
  'timelog.fixtures',
  'payroll.json',
  'payroll-runs.json',
  'payroll-structures.json',
  'salary-components.json',
  'statutory-rules.json',
  'approvals.json',
  'approval-policies.json',
  'shifts.json',
  'organization.json',
  'files.json',
  'holidays.json',
  'holiday.fixtures',
  'onboarding.json',
];

/** Reconciled areas, which must not read or write browser storage for server state. */
const SERVER_STATE_PATHS = [
  'repositories/workforce.repository.ts',
  'repositories/teams-projects.repository.ts',
  'repositories/attendance.repository.ts',
  'hooks/use-teams.ts',
  'hooks/use-team-directory.ts',
  'hooks/use-project-directory.ts',
  'hooks/use-attendance.ts',
  'hooks/use-attendance-admin.ts',
  'hooks/use-attendance-preferences.ts',
  'services/team-directory.ts',
  'services/attendance-view.ts',
  'repositories/leave.repository.ts',
  'hooks/use-leave.ts',
  'hooks/use-leave-admin.ts',
  'repositories/timesheet.repository.ts',
  'hooks/use-timesheet.ts',
  'hooks/use-timesheet-admin.ts',
  'services/timesheet-view.ts',
  'repositories/payroll.repository.ts',
  'hooks/use-payroll.ts',
  'hooks/use-payroll-admin.ts',
  'hooks/use-compensation.ts',
  'repositories/approvals.repository.ts',
  'hooks/use-approval-policies.ts',
  'hooks/use-approval-inbox.ts',
  'hooks/use-roles.ts',
  'repositories/shifts.repository.ts',
  'hooks/use-shifts.ts',
  'repositories/organization.repository.ts',
  'hooks/use-organization.ts',
  'components/organization/organization-workspace.tsx',
  'components/organization/org-profile-panel.tsx',
  'components/organization/org-branches-panel.tsx',
  'repositories/files.repository.ts',
  'hooks/use-files.ts',
  'components/screen-files/screen-files.tsx',
  'repositories/holidays.repository.ts',
  'hooks/use-holidays.ts',
  'components/screen-holidays/screen-holidays.tsx',
  'components/screen-onboarding/screen-onboarding.tsx',
];

/** Strips comments, so a note explaining why a fixture was removed does not trip the guard. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe('retired fixtures stay retired', () => {
  const files = sourceFiles(MODULE_ROOT);

  it.each(RETIRED_FIXTURES)('no runtime file imports %s', (fixture) => {
    const offenders = files
      .filter((file) => {
        const text = code(readFileSync(file, 'utf8'));
        // Only import statements count; a mention in a comment explaining the removal is fine.
        return new RegExp(`from '[^']*${fixture.replace('.', '\\.')}'`).test(text);
      })
      .map((file) => relative(MODULE_ROOT, file));

    expect(offenders).toEqual([]);
  });
});

describe('reconciled modules keep server state on the server', () => {
  it.each(SERVER_STATE_PATHS)('%s does not touch browser storage', (relativePath) => {
    const text = code(readFileSync(join(MODULE_ROOT, relativePath), 'utf8'));
    expect(text).not.toMatch(/localStorage/);
    expect(text).not.toMatch(/emsStorageAdapter/);
  });

  it.each(SERVER_STATE_PATHS)('%s has no fixture fallback', (relativePath) => {
    const text = code(readFileSync(join(MODULE_ROOT, relativePath), 'utf8'));
    // `data || fixture` and `catch { return fixture }` are the two shapes that turn a failed
    // request into content the server never sent.
    expect(text).not.toMatch(/Fixture\b/);
    expect(text).not.toMatch(/fixtures\//);
  });
});
