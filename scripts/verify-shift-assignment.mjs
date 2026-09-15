#!/usr/bin/env node
/**
 * Employee shift assignments — against the running API.
 *
 * Assignments could be written but never read back or ended: Home's Work Schedule card always
 * said "Not recorded", nothing listed who was on a shift, and moving someone to another shift was
 * impossible because the old open-ended assignment could not be closed. This checks:
 *
 *   - the employee sees their own shift; a colleague is refused; nobody sees another tenant's;
 *   - the administrator lists who is on a shift; an employee lists only their own;
 *   - an assignment is ended on a chosen last day, audited, only ever earlier, never by an
 *     employee or another tenant — and the employee can then be assigned the next shift.
 *
 *   pnpm verify:shift-assignment
 */
import { createRequire } from 'node:module';
import { resolveDatabaseUrl } from './lib/database-url.mjs';
import { finish, good, ok, rows, tenant } from './lib/authz-harness.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
/** `YYYY-MM-DD` shifted by whole days, on the calendar rather than the clock. */
const addDays = (key, days) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const t = await tenant('sa');
const other = await tenant('sx');
const TODAY = t.today;
const STARTS = addDays(TODAY, -10);
const YESTERDAY = addDays(TODAY, -1);

const newShift = (name, startsAt, endsAt) =>
  t.org('POST', '/shifts', {
    code: name.slice(0, 3).toUpperCase() + Date.now().toString(36).slice(-4),
    name,
    daysOfWeek: [1, 2, 3, 4, 5],
    startsAt,
    endsAt,
    crossesMidnight: false,
    breakMinutes: 60,
  });
const day = await newShift('General', '09:30', '18:30');
const late = await newShift('Late', '13:00', '22:00');
ok('setup: two shifts are created', good(day) && good(late), `${status(day)} / ${status(late)}`);
const assigned = await t.org('POST', `/shifts/employees/${t.a.id}/assignments`, {
  shiftId: day.payload?.id,
  startsOn: STARTS,
});
ok('setup: Ada is on General, open-ended', good(assigned), status(assigned));

console.log('\nreading the current shift');
const current = '/shifts/assignments/current';
const mine = await t.a.as('GET', `${current}?on=${TODAY}`);
ok(
  'Ada sees her shift and its hours',
  mine.payload?.assignment?.shift?.name === 'General' &&
    mine.payload?.assignment?.shift?.startsAt === '09:30:00' &&
    mine.payload?.assignment?.shift?.endsAt === '18:30:00',
  status(mine),
);
const earlier = await t.a.as('GET', `${current}?on=${addDays(STARTS, -1)}`);
ok(
  'and none for a day before the assignment starts',
  good(earlier) && earlier.payload?.assignment === null,
  status(earlier),
);
const none = await t.b.as('GET', current);
ok('Bea, with no assignment, is told there is none', none.payload?.assignment === null);
const peek = await t.b.as('GET', `${current}?employeeId=${t.a.id}`);
ok("Bea cannot read Ada's shift", peek.status === 409, status(peek));
const foreign = await other.org('GET', `${current}?employeeId=${t.a.id}`);
ok('another tenant gets nothing', foreign.status >= 400 || foreign.payload?.assignment === null);
const badDate = await t.a.as('GET', `${current}?on=15-09-2026`);
ok('a malformed date is rejected', badDate.status === 400, status(badDate));

console.log('\nwho is on a shift');
const people = (caller, query) => caller('GET', `/shifts/assignments?${query}`);
const onDay = await people(t.org, `shiftId=${day.payload?.id}`);
const adaRow = rows(onDay.payload).find((row) => row.employee?.id === t.a.id);
ok(
  'the administrator sees Ada on General, current and open-ended',
  adaRow?.state === 'CURRENT' && adaRow?.endsOn === null && adaRow?.startsOn === STARTS,
  status(onDay),
);
const beaList = await people(t.b.as, '');
ok('an employee listing sees only their own (none)', rows(beaList.payload).length === 0);
const beaPeek = await people(t.b.as, `employeeId=${t.a.id}`);
ok("an employee cannot list a colleague's assignments", beaPeek.status === 409, status(beaPeek));
const otherList = await people(other.org, `shiftId=${day.payload?.id}`);
ok('another tenant lists nothing of this one', rows(otherList.payload).length === 0);

console.log('\nending an assignment, then the next shift');
const endPath = `/shifts/assignments/${adaRow?.id}/end`;
const byEmployee = await t.a.as('POST', endPath, { endsOn: YESTERDAY, reason: 'Myself' });
ok('an employee cannot end an assignment', byEmployee.status === 403, status(byEmployee));
const byOther = await other.org('POST', endPath, { endsOn: YESTERDAY, reason: 'Other tenant' });
ok('another tenant cannot end it', byOther.status === 404, status(byOther));
const tooEarly = await t.org('POST', endPath, {
  endsOn: addDays(STARTS, -1),
  reason: 'Before it began',
});
ok('a last day before it starts is refused', tooEarly.status === 409, status(tooEarly));
const noReason = await t.org('POST', endPath, { endsOn: YESTERDAY, reason: '' });
ok('ending needs a reason', noReason.status === 400, status(noReason));
const blocked = await t.org('POST', `/shifts/employees/${t.a.id}/assignments`, {
  shiftId: late.payload?.id,
  startsOn: TODAY,
});
ok('before ending it, the next shift overlaps and is refused', blocked.status === 409);

const ended = await t.org('POST', endPath, { endsOn: YESTERDAY, reason: 'Moving to Late' });
ok('the administrator ends it on yesterday', good(ended) && ended.payload?.endsOn === YESTERDAY);
const later = await t.org('POST', endPath, { endsOn: TODAY, reason: 'Extend it again' });
ok('it can only be ended earlier, never extended', later.status === 409, status(later));
const moved = await t.org('POST', `/shifts/employees/${t.a.id}/assignments`, {
  shiftId: late.payload?.id,
  startsOn: TODAY,
});
ok('Ada can now be assigned Late from today', good(moved), status(moved));
const nowOn = await t.a.as('GET', current);
ok('and her current shift is Late', nowOn.payload?.assignment?.shift?.name === 'Late');
const stillListed = await people(t.org, `shiftId=${day.payload?.id}`);
ok(
  'General no longer lists her as current',
  !rows(stillListed.payload).some((row) => row.employee?.id === t.a.id),
);
const history = await people(t.org, `shiftId=${day.payload?.id}&includeEnded=true`);
ok(
  'but its history does, as ended',
  rows(history.payload).some((row) => row.employee?.id === t.a.id && row.state === 'ENDED'),
);

const db = new Client({ connectionString: resolveDatabaseUrl() });
await db.connect();
const audit = await db.query(
  "SELECT reason FROM audit_logs WHERE entity_id = $1 AND action = 'SHIFT_ASSIGNMENT_ENDED'",
  [adaRow?.id],
);
ok(
  'the end is audited once, with its reason',
  audit.rows.length === 1 && audit.rows[0].reason === 'Moving to Late',
  `${audit.rows.length} row(s)`,
);
await db.end();

finish();
