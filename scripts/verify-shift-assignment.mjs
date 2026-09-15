#!/usr/bin/env node
/**
 * Reading an employee's own shift — against the running API.
 *
 * Shift assignments could be written but never read back, so Home's Work Schedule card always
 * said "Not recorded". This assigns a shift and checks what each person can see:
 *
 *   the employee sees their own shift and its times; a colleague asking for it is refused; an
 *   employee with no assignment is told there is none; another tenant sees nothing.
 *
 *   pnpm verify:shift-assignment
 */
import { finish, good, ok, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));

const t = await tenant('sa');
const other = await tenant('sx');

const shift = await t.org('POST', '/shifts', {
  code: 'GEN' + Date.now().toString(36).slice(-4),
  name: 'General',
  daysOfWeek: [1, 2, 3, 4, 5],
  startsAt: '09:30',
  endsAt: '18:30',
  crossesMidnight: false,
  breakMinutes: 60,
});
ok('setup: a shift is created', good(shift), status(shift));
const assigned = await t.org('POST', `/shifts/employees/${t.a.id}/assignments`, {
  shiftId: shift.payload?.id,
  startsOn: t.monthStart,
});
ok('setup: Ada is assigned to it', good(assigned), status(assigned));

const current = '/shifts/assignments/current';
const mine = await t.a.as('GET', `${current}?on=${t.today}`);
ok(
  'Ada sees her shift and its hours',
  mine.payload?.assignment?.shift?.name === 'General' &&
    mine.payload?.assignment?.shift?.startsAt === '09:30:00' &&
    mine.payload?.assignment?.shift?.endsAt === '18:30:00',
  status(mine),
);
const before = await t.a.as('GET', `${current}?on=2025-12-31`);
ok(
  'and none for a day before the assignment starts',
  good(before) && before.payload?.assignment === null,
  status(before),
);
const none = await t.b.as('GET', current);
ok(
  'Bea, with no assignment, is told there is none',
  good(none) && none.payload?.assignment === null,
  status(none),
);
const peek = await t.b.as('GET', `${current}?employeeId=${t.a.id}`);
ok("Bea cannot read Ada's shift", peek.status === 409, status(peek));
const admin = await t.org('GET', `${current}?employeeId=${t.a.id}`);
ok(
  "the administrator can read Ada's shift",
  admin.payload?.assignment?.shift?.id === shift.payload?.id,
  status(admin),
);
const foreign = await other.org('GET', `${current}?employeeId=${t.a.id}`);
ok(
  'another tenant gets nothing',
  foreign.status >= 400 || foreign.payload?.assignment === null,
  status(foreign),
);
const badDate = await t.a.as('GET', `${current}?on=15-09-2026`);
ok('a malformed date is rejected', badDate.status === 400, status(badDate));

finish();
