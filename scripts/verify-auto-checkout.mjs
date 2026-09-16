#!/usr/bin/env node
/**
 * Closing a day nobody checked out of — against the running API.
 *
 * The close proposes; a person decides. This drives the whole path with real sessions:
 *
 *   the organization switches it on → an employee checks in and never out → the close raises the
 *   ordinary correction at the cutoff time, and the day still counts nothing → the approver sees
 *   where the time came from → they approve at the real time instead → that check-out is the one
 *   recorded, and payroll over the day is stale.
 *
 * Also: it runs once per day however often it sweeps, an employee can neither run it nor decide
 * their own, a night shift is left alone, another tenant is refused, and an organization that has
 * not asked for it is untouched.
 *
 *   pnpm verify:auto-checkout
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const prefs = (body) => t.org('POST', '/attendance/preferences', body);

const t = await tenant('ac');
const other = await tenant('ax');

console.log('the organization asks for it');
// A cutoff already past today, so a single run has something due.
const on = await prefs({ autoCheckOutMode: 'REVIEW_REQUIRED', autoCheckOutAt: '00:01' });
ok('the setting is saved', good(on), status(on));
const read = await t.org('GET', '/attendance/preferences');
ok(
  'and read back',
  read.payload?.autoCheckOutMode === 'REVIEW_REQUIRED' &&
    String(read.payload?.autoCheckOutAt).startsWith('00:01'),
  `${read.payload?.autoCheckOutMode} ${read.payload?.autoCheckOutAt}`,
);
const perBranch = await prefs({ branchId: t.branchId, autoCheckOutMode: 'DISABLED' });
ok('it cannot be set per branch', perBranch.status === 409, status(perBranch));
const badTime = await prefs({ autoCheckOutAt: '25:00' });
ok('an impossible time is refused', badTime.status === 400, status(badTime));

console.log('\na day that was never checked out of');
// Recorded by the administrator, who may state the time: a self-service punch is always stamped
// at server time, which would leave no room for a check-out two hours later that is not in the
// future.
const CHECK_IN_AT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
const checkIn = await t.org('POST', '/attendance/check-ins', {
  employeeId: t.a.id,
  occurredAt: CHECK_IN_AT,
  workDate: t.today,
  branchId: t.branchId,
});
ok('Ada checks in', good(checkIn), status(checkIn));
const day = async (who = t.org, employeeId = t.a.id) =>
  rows(
    (await who('GET', `/attendance?employeeId=${employeeId}&from=${t.today}&to=${t.today}`))
      .payload,
  )[0];
const open = await day();
ok(
  'the day counts nothing while it is open',
  open?.workedMinutes === 0,
  String(open?.workedMinutes),
);

const byEmployee = await t.a.as('POST', '/attendance/auto-check-out/run', {});
ok('an employee cannot run the close', refused(byEmployee), status(byEmployee));
const closed = await t.org('POST', '/attendance/auto-check-out/run', {});
ok('the administrator closes the due days', closed.payload?.closed >= 1, status(closed));
const afterClose = await day();
ok(
  'the close records no time of its own',
  afterClose?.workedMinutes === 0 && (afterClose?.punches ?? []).length === 1,
  `${afterClose?.workedMinutes} min, ${(afterClose?.punches ?? []).length} punch(es)`,
);
const again = await t.org('POST', '/attendance/auto-check-out/run', {});
ok(
  'running it again raises nothing new',
  again.payload?.closed === 0 && again.payload?.skippedAlreadyPending >= 1,
  JSON.stringify(again.payload),
);

console.log('\nthe decision');
const inbox = rows((await t.org('GET', '/attendance/corrections/inbox')).payload);
const review = inbox.find((entry) => entry.afterSnapshot?.missingCheckOut?.autoClosed);
ok(
  'the approver sees it, marked as closed automatically',
  Boolean(review),
  `${inbox.length} item(s)`,
);
const proposed = review?.afterSnapshot?.missingCheckOut?.occurredAt;
ok('with the proposed time on it', Boolean(proposed), String(proposed));

const bySelf = await t.a.as('POST', `/attendance/${review?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Approving my own day',
});
ok('the employee cannot decide their own day', refused(bySelf), status(bySelf));
const byOther = await other.org('POST', `/attendance/${review?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Another tenant',
});
ok('another tenant cannot decide it', byOther.status === 404, status(byOther));

// The real time the employee left: two hours after the check-in, not the end of the day.
const realCheckOut = new Date(new Date(CHECK_IN_AT).getTime() + 2 * 60 * 60 * 1000).toISOString();
const decided = await t.org('POST', `/attendance/${review?.id}/decision`, {
  status: 'APPROVED',
  comment: 'He left at two hours in; confirmed',
  checkOutAt: realCheckOut,
});
ok('the approver accepts it at the real time', good(decided), status(decided));
const settled = await day();
const outPunch = (settled?.punches ?? []).find((punch) => punch.punchType === 'OUT');
ok(
  "the recorded check-out is the approver's time, not the cutoff",
  outPunch?.occurredAt === realCheckOut,
  `${outPunch?.occurredAt} vs proposed ${proposed}`,
);
ok(
  'and the day is now worth the hours actually worked',
  settled?.workedMinutes === 120,
  String(settled?.workedMinutes),
);
const twice = await t.org('POST', `/attendance/${review?.id}/decision`, {
  status: 'APPROVED',
  comment: 'Approving again',
});
ok('it cannot be decided twice', twice.status === 409, status(twice));

console.log('\nthe days it leaves alone');
const night = await t.org('POST', '/shifts', {
  code: 'NGT' + Date.now().toString(36).slice(-4),
  name: 'Night',
  daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  startsAt: '22:00',
  endsAt: '06:00',
  crossesMidnight: true,
  breakMinutes: 30,
});
const assigned = await t.org('POST', `/shifts/employees/${t.b.id}/assignments`, {
  shiftId: night.payload?.id,
  startsOn: t.today,
});
ok('setup: Bea is on a shift that crosses midnight', good(assigned), status(assigned));
const beaIn = await t.org('POST', '/attendance/check-ins', {
  employeeId: t.b.id,
  occurredAt: CHECK_IN_AT,
  workDate: t.today,
  branchId: t.branchId,
});
ok('setup: Bea checks in', good(beaIn), status(beaIn));
const nightRun = await t.org('POST', '/attendance/auto-check-out/run', {});
ok(
  'a night shift is left for a person to close',
  nightRun.payload?.closed === 0 && nightRun.payload?.skippedNightShift >= 1,
  JSON.stringify(nightRun.payload),
);
const beaDay = await day(t.org, t.b.id);
ok(
  "and Bea's day is untouched",
  beaDay?.workedMinutes === 0 && (beaDay?.punches ?? []).length === 1,
  `${beaDay?.workedMinutes} min`,
);

const off = await prefs({ autoCheckOutMode: 'DISABLED' });
ok('the organization can switch it off', good(off), status(off));
const offRun = await t.org('POST', '/attendance/auto-check-out/run', {});
ok('and then nothing closes', offRun.payload?.closed === 0, JSON.stringify(offRun.payload));

const otherRun = await other.org('POST', '/attendance/auto-check-out/run', {});
ok(
  "another tenant's run touches nothing here",
  good(otherRun) && otherRun.payload?.closed === 0,
  status(otherRun),
);

finish();
