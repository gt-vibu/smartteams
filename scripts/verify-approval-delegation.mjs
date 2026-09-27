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
// Their own handover is a request: nothing moves until Bea accepts it.
ok('it waits for Bea to accept', handed.payload?.status === 'PENDING', handed.payload?.status);
const early = await t.b.as('POST', '/timesheets/' + first + '/decision', {
  status: 'APPROVED',
  comment: 'Too early',
});
ok('until she accepts, Bea still cannot decide', refused(early), status(early));
const adaAnswers = await t.a.as(
  'POST',
  '/approval-delegations/' + handed.payload?.id + '/accept',
  {},
);
ok('only the person asked can answer', refused(adaAnswers), status(adaAnswers));
const accepted = await t.b.as(
  'POST',
  '/approval-delegations/' + handed.payload?.id + '/accept',
  {},
);
ok(
  'Bea accepts, and it is active today',
  good(accepted) && accepted.payload?.status === 'ACTIVE',
  status(accepted) + ' ' + accepted.payload?.status,
);
const again = await t.b.as('POST', '/approval-delegations/' + handed.payload?.id + '/decline', {});
ok('an answered request cannot be answered again', again.status === 409, status(again));
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
  'and was asked',
  beaFeed.some((item) => item.kind === 'APPROVALS_COVER_REQUESTED'),
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

console.log('\ndeclining, and cover set by an administrator');
{
  // Ada asks Bea to cover; Bea declines, so nothing is handed over.
  const asked = await t.a.as('POST', '/approval-delegations', {
    delegateEmployeeId: t.b.id,
    startsOn: inAWeek,
    endsOn: inAWeek,
  });
  const declined = await t.b.as(
    'POST',
    '/approval-delegations/' + asked.payload?.id + '/decline',
    {},
  );
  ok(
    'Bea can decline a request',
    good(asked) && good(declined) && declined.payload?.status === 'DECLINED',
    status(asked) + ' / ' + status(declined),
  );
  const adaFeed = rows((await t.a.as('GET', '/notifications')).payload?.items ?? []);
  ok(
    'and Ada is told',
    adaFeed.some((item) => item.kind === 'APPROVALS_COVER_DECLINED'),
    adaFeed.map((item) => item.kind).join(', '),
  );

  // An employee cannot arrange someone else's cover.
  const forOther = await t.a.as('POST', '/approval-delegations', {
    delegatorEmployeeId: t.b.id,
    delegateEmployeeId: t.a.id,
    startsOn: inAWeek,
    endsOn: inAWeek,
  });
  ok("an employee cannot set up someone else's cover", refused(forOther), status(forOther));

  // The administrator arranges Bea's cover by Ada: it stands without Ada accepting.
  const set = await t.org('POST', '/approval-delegations', {
    delegatorEmployeeId: t.b.id,
    delegateEmployeeId: t.a.id,
    startsOn: inAWeek,
    endsOn: inAWeek,
  });
  ok(
    "an administrator's cover takes effect without asking",
    good(set) &&
      ['UPCOMING', 'ACTIVE'].includes(set.payload?.status) &&
      set.payload?.setByAdministrator === true,
    status(set) + ' ' + set.payload?.status,
  );
  const all = await t.org('GET', '/approval-delegations');
  ok(
    "the administrator sees everyone's cover",
    (all.payload?.all ?? []).some((item) => item.id === set.payload?.id),
  );
}

finish();
