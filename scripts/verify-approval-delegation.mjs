#!/usr/bin/env node
/**
 * Handing over approvals — against the running API.
 *
 * The administrator (who approves by default) goes on leave and hands their approvals to Bea.
 * Before the handover Bea is refused; during it she decides, and is told what is waiting; after
 * it is ended she is refused again. Nobody hands over to themselves, and only the delegator ends
 * their own handover.
 *
 *   pnpm verify:approval-delegation
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('ad', { defaultPolicies: false });
const today = new Date().toISOString().slice(0, 10);
const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

const submitTimesheet = async () => {
  const logged = await t.a.as('POST', '/timesheets/entries', {
    workDate: today,
    minutes: 120,
    description: 'Design review',
  });
  const sheetId = logged.payload?.timesheet?.id;
  await t.a.as('POST', `/timesheets/${sheetId}/submit`, {});
  return sheetId;
};

console.log('setup');
const opened = await t.org('POST', '/timesheets/periods', {
  periodType: 'MONTHLY',
  periodStart: t.monthStart,
  periodEnd: t.today,
});
await t.org('POST', `/timesheets/periods/${opened.payload?.id}/derive`, {});
const first = await submitTimesheet();
ok('Ada submits a timesheet for the administrator', Boolean(first));
const before = await t.b.as('POST', `/timesheets/${first}/decision`, {
  status: 'APPROVED',
  comment: 'Covering',
});
ok('before any handover, Bea cannot decide it', refused(before), status(before));

console.log('\nhanding over');
const toSelf = await t.a.as('POST', '/approval-delegations', {
  delegateEmployeeId: t.a.id,
  startsOn: today,
  endsOn: inAWeek,
});
ok('nobody hands over to themselves', toSelf.status === 409, status(toSelf));
const backwards = await t.org('POST', '/approval-delegations', {
  delegateEmployeeId: t.b.id,
  startsOn: inAWeek,
  endsOn: today,
});
ok('the last day cannot come before the first', backwards.status === 409, status(backwards));
const handed = await t.org('POST', '/approval-delegations', {
  delegateEmployeeId: t.b.id,
  startsOn: today,
  endsOn: inAWeek,
  reason: 'Annual leave',
});
ok('the administrator hands their approvals to Bea', good(handed), status(handed));
ok('it is active today', handed.payload?.status === 'ACTIVE', handed.payload?.status);
const twice = await t.org('POST', '/approval-delegations', {
  delegateEmployeeId: t.b.id,
  startsOn: today,
  endsOn: today,
});
ok('overlapping days are refused', twice.status === 409, status(twice));
const beaList = await t.b.as('GET', '/approval-delegations');
ok('Bea sees what she is covering', beaList.payload?.received?.length === 1);
const beaFeed = rows((await t.b.as('GET', '/notifications')).payload?.items ?? []);
ok(
  'and is told',
  beaFeed.some((item) => item.kind === 'APPROVALS_DELEGATED'),
  beaFeed.map((item) => item.kind).join(', '),
);

console.log('\ncovering');
const decided = await t.b.as('POST', `/timesheets/${first}/decision`, {
  status: 'REJECTED',
  comment: 'Please split the design review by project',
});
ok('Bea decides it now (sends it back)', good(decided), status(decided));
const second = await submitTimesheet();
const beaFeedAfter = (await t.b.as('GET', '/notifications')).payload?.items ?? [];
ok(
  'the resubmission reaches Bea too, as the one covering',
  beaFeedAfter.some((item) => item.kind === 'TIMESHEET_PENDING' && item.entityId === second),
);
const byAda = await t.a.as('POST', `/approval-delegations/${handed.payload?.id}/revoke`, {});
ok('only the administrator can end their handover', refused(byAda), status(byAda));

console.log('\nending it');
const ended = await t.org('POST', `/approval-delegations/${handed.payload?.id}/revoke`, {});
ok('the administrator ends it early', good(ended), status(ended));
const after = await t.b.as('POST', `/timesheets/${second}/decision`, {
  status: 'APPROVED',
  comment: 'Still covering?',
});
ok('Bea can no longer decide', refused(after), status(after));
const own = await t.org('POST', `/timesheets/${second}/decision`, {
  status: 'APPROVED',
  comment: 'Back from leave',
});
ok('the administrator still can', good(own), status(own));

finish();
