#!/usr/bin/env node
/**
 * The team leave calendar — against the running API.
 *
 * Someone who reads all leave sees everyone's, with the type. A colleague sees a teammate's
 * leave only once they share a team, and never its type or reason; the person sees their own.
 *
 *   pnpm verify:leave-calendar
 */
import { finish, good, ok, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('lc');
const iso = (d) => d.toISOString().slice(0, 10);

// The next weekday at least two days out, so it is a working day in any default week.
const day = new Date(Date.now() + 2 * 86_400_000);
while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
const from = iso(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)));
const to = iso(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)));
const calendar = (as) => as('GET', `/leave/calendar?from=${from}&to=${to}`);
const adaIn = (r) => (r.payload?.entries ?? []).find((entry) => entry.employeeId === t.a.id);

console.log('setup');
const type = await t.org('POST', '/leave/types', {
  code: 'CAL',
  name: 'Calendar leave',
  paid: true,
  accrualType: 'FIXED_ANNUAL',
  annualAllowance: 12,
  requiresAttachment: false,
});
await t.org('POST', '/leave/types/CAL/assign', { branchId: t.branchId });
const asked = await t.a.as('POST', '/leave/requests', {
  employeeId: t.a.id,
  leaveTypeId: type.payload?.id,
  startDate: iso(day),
  endDate: iso(day),
  reason: 'Family function',
});
ok('Ada requests a day off', good(asked), status(asked));

console.log('\nwho sees it');
const admin = await calendar(t.org);
ok('the administrator sees it', Boolean(adaIn(admin)), status(admin));
ok('with its type', adaIn(admin)?.type === 'Calendar leave', adaIn(admin)?.type);
ok('marked as requested until decided', adaIn(admin)?.status === 'PENDING');
ok('the reason is never part of the calendar', adaIn(admin)?.reason === undefined);
const own = await calendar(t.a.as);
ok('Ada sees her own, with its type', adaIn(own)?.isYou === true && adaIn(own)?.type !== null);
const stranger = await calendar(t.b.as);
ok('Bea, who does not work with Ada, does not see it', !adaIn(stranger), status(stranger));

const team = await t.org('POST', '/teams', {
  name: `Calendar ${Date.now()}`,
  branchId: t.branchId,
});
for (const who of [t.a.id, t.b.id])
  await t.org('POST', `/teams/${team.payload?.id}/members`, {
    employeeId: who,
    joinedAt: '2026-01-01',
  });
const teammate = await calendar(t.b.as);
ok('once they share a team, Bea sees that Ada is off', Boolean(adaIn(teammate)));
ok('but not what kind of leave it is', adaIn(teammate)?.type === null, adaIn(teammate)?.type);

console.log('\nthe span asked for');
const backwards = await t.org('GET', `/leave/calendar?from=${to}&to=${from}`);
ok('an end before the start is refused', backwards.status === 409, status(backwards));
const huge = await t.org('GET', `/leave/calendar?from=2026-01-01&to=2026-12-31`);
ok('more than three months is refused', huge.status === 409, status(huge));
const missing = await t.org('GET', '/leave/calendar');
ok('dates are required', missing.status === 400, status(missing));

finish();
