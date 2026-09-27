#!/usr/bin/env node
/**
 * Bulk employee import — against the running API.
 *
 * A dry run reports every problem per row and writes nothing; the real run hires the good rows
 * through the ordinary hiring path and reports the rest. Only someone who may hire can import.
 *
 *   pnpm verify:employee-import
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';
import { testAadhaar } from './lib/aadhaar.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('ei');
const branches = rows((await t.org('GET', '/branches')).payload);
const stamp = Date.now();
const shared = testAadhaar();

const sheet = [
  {
    firstName: 'Ravi',
    lastName: 'Kumar',
    workEmail: `ravi.${stamp}@t.test`,
    employmentType: 'Full time',
    dateOfJoining: '15/07/2026',
    aadhaarNumber: testAadhaar(),
    branch: branches[0]?.name,
  },
  {
    firstName: 'Meera',
    lastName: 'Iyer',
    employeeNumber: `IMP-${stamp}`,
    employmentType: 'contract',
    dateOfJoining: '2026-08-01',
    aadhaarNumber: shared,
  },
  { firstName: '', lastName: 'Nobody', aadhaarNumber: '1234' },
  {
    firstName: 'Twin',
    lastName: 'Copy',
    aadhaarNumber: shared,
    workEmail: `ravi.${stamp}@t.test`,
    branch: 'Atlantis',
    dateOfJoining: '31/02/2026',
  },
];

console.log('dry run');
const before = rows((await t.org('GET', '/employees')).payload).length;
const dry = await t.org('POST', '/employee-imports', { rows: sheet, dryRun: true });
ok('the file is checked', good(dry), status(dry));
ok('two rows are good, two are not', dry.payload?.valid === 2 && dry.payload?.invalid === 2);
const third = dry.payload?.rows?.[2]?.errors ?? [];
ok('a missing name and a bad Aadhaar are both named', third.length >= 2, third.join(' | '));
const fourth = (dry.payload?.rows?.[3]?.errors ?? []).join(' | ');
ok('a repeat of an earlier row is caught', /row 1|row 2/.test(fourth), fourth);
ok('an unknown branch is caught', /Atlantis/.test(fourth));
ok('an impossible date is caught', /31\/02\/2026/.test(fourth));
const after = rows((await t.org('GET', '/employees')).payload).length;
ok('nothing is written by a dry run', after === before, `${before} → ${after}`);

console.log('\nimport');
const run = await t.org('POST', '/employee-imports', { rows: sheet });
ok('the import runs', good(run), status(run));
ok(
  'the good rows are hired',
  run.payload?.valid === 2,
  JSON.stringify(run.payload?.rows?.map((r) => r.errors)),
);
const hired = rows((await t.org('GET', '/employees')).payload);
ok('they are in the directory', hired.length === before + 2, `${before} → ${hired.length}`);
ok(
  'an employee number from the file is kept',
  hired.some((employee) => employee.employeeNumber === `IMP-${stamp}`),
);
const again = await t.org('POST', '/employee-imports', { rows: sheet.slice(0, 2), dryRun: true });
ok('importing the same people again is refused row by row', again.payload?.invalid === 2);

console.log('\nwho may import');
const byEmployee = await t.a.as('POST', '/employee-imports', { rows: sheet, dryRun: true });
ok('an employee cannot', refused(byEmployee), status(byEmployee));
const empty = await t.org('POST', '/employee-imports', { rows: [] });
ok('an empty file is refused with a reason', empty.status === 409, status(empty));

finish();
