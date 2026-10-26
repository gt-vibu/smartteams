#!/usr/bin/env node
/**
 * Notifications — against the running API.
 *
 * The drawer used to be a fixed list: everyone saw the same items, reading one read it for
 * everybody, and the times were made up. Now a notification is a row for one recipient, written
 * in the transaction of the action it describes. This drives the routing end to end:
 *
 *   Ada submits a timesheet → the approver (administrator role) is told, Ada and Bea are not →
 *   the administrator approves → Ada is told, the administrator is not → the time on each is the
 *   moment of the action → Ada reading hers leaves the administrator's unread → nobody can read
 *   or mark another person's → an attendance correction routes the same way.
 *
 *   pnpm verify:notifications
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('nt', { defaultPolicies: false });

const feed = async (as) => (await as('GET', '/notifications')).payload ?? { unread: 0, items: [] };
const admin = (m, p, b) => t.org(m, p, b);
const ada = t.a.as;
const bea = t.b.as;
const about = (items, entityId, kind) =>
  items.filter((item) => item.entityId === entityId && item.kind === kind);
const within = (item, from, to) => {
  const at = new Date(item?.createdAt ?? 0).getTime();
  return at >= from - 2000 && at <= to + 2000;
};

console.log('a timesheet is submitted');
const opened = await admin('POST', '/timesheets/periods', {
  periodType: 'MONTHLY',
  periodStart: t.monthStart,
  periodEnd: t.today,
});
await admin('POST', '/timesheets/periods/' + opened.payload?.id + '/derive', {});
const logged = await ada('POST', '/timesheets/entries', {
  workDate: t.today,
  minutes: 240,
  description: 'Client onboarding',
});
ok('setup: Ada logs her hours', good(logged), status(logged));
const sheetId = logged.payload?.timesheet?.id;
const submittedFrom = Date.now();
const submitted = await ada('POST', '/timesheets/' + sheetId + '/submit', {});
const submittedTo = Date.now();
ok('setup: Ada submits', good(submitted), status(submitted));

const adminPending = about((await feed(admin)).items, sheetId, 'TIMESHEET_PENDING');
ok('the approver is told it is waiting', adminPending.length === 1, `${adminPending.length}`);
ok(
  'it opens the approvals screen',
  adminPending[0]?.module === 'approvals',
  adminPending[0]?.module,
);
ok(
  'its time is the moment Ada submitted',
  within(adminPending[0], submittedFrom, submittedTo),
  adminPending[0]?.createdAt,
);
ok('it arrives unread', adminPending[0]?.readAt === null);
ok(
  'Ada, who submitted it, is not told',
  about((await feed(ada)).items, sheetId, 'TIMESHEET_PENDING').length === 0,
);
ok('Bea, who has nothing to do with it, is not told', (await feed(bea)).items.length === 0);

console.log('\nthe administrator approves it');
const decidedFrom = Date.now();
const approved = await admin('POST', '/timesheets/' + sheetId + '/decision', {
  status: 'APPROVED',
  comment: 'Hours confirmed',
});
const decidedTo = Date.now();
ok('setup: approved', good(approved), status(approved));
const adaFeed = await feed(ada);
const adaDecided = about(adaFeed.items, sheetId, 'TIMESHEET_DECIDED');
ok('Ada is told', adaDecided.length === 1, `${adaDecided.length}`);
ok('it says approved', /approved/i.test(adaDecided[0]?.title ?? ''), adaDecided[0]?.title);
ok('its time is the moment of the decision', within(adaDecided[0], decidedFrom, decidedTo));
ok(
  'the administrator who decided is not told about their own decision',
  about((await feed(admin)).items, sheetId, 'TIMESHEET_DECIDED').length === 0,
);
ok('Ada has it as unread', adaFeed.unread >= 1, `${adaFeed.unread}`);

console.log('\nreading is per person');
const read = await ada('POST', `/notifications/${adaDecided[0]?.id}/read`, {});
ok('Ada marks hers read', good(read), status(read));
const adaAfter = about((await feed(ada)).items, sheetId, 'TIMESHEET_DECIDED')[0];
ok('it is read for Ada', Boolean(adaAfter?.readAt));
const adminAfter = about((await feed(admin)).items, sheetId, 'TIMESHEET_PENDING')[0];
ok("the administrator's is still unread", adminAfter?.readAt === null, adminAfter?.readAt);

const beaReads = await bea('POST', `/notifications/${adminPending[0]?.id}/read`, {});
ok("Bea cannot mark the administrator's read", refused(beaReads), status(beaReads));
const adaReads = await ada('POST', `/notifications/${adminPending[0]?.id}/read`, {});
ok('nor can Ada', refused(adaReads), status(adaReads));
ok(
  'and it is still unread',
  about((await feed(admin)).items, sheetId, 'TIMESHEET_PENDING')[0]?.readAt === null,
);
const adminPeeks = (await feed(admin)).items.some((item) => item.id === adaDecided[0]?.id);
ok("the administrator does not see Ada's in their own list", !adminPeeks);

console.log('\nan attendance correction');
const checkInAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
await admin('POST', '/attendance/check-ins', {
  employeeId: t.b.id,
  occurredAt: checkInAt,
  workDate: t.today,
  branchId: t.branchId,
});
const dayId = rows(
  (await admin('GET', `/attendance?employeeId=${t.b.id}&from=${t.today}&to=${t.today}`)).payload,
)[0]?.id;
const asked = await bea('POST', `/attendance/${dayId}/corrections/missing-check-out`, {
  checkOutAt: new Date(new Date(checkInAt).getTime() + 60 * 60 * 1000).toISOString(),
  reason: 'Forgot to check out',
});
ok('setup: Bea asks for her check-out', good(asked), status(asked));
const correctionId = asked.payload?.id;
ok(
  'the approver is told',
  about((await feed(admin)).items, correctionId, 'ATTENDANCE_CORRECTION_PENDING').length === 1,
);
ok(
  'Ada is not',
  about((await feed(ada)).items, correctionId, 'ATTENDANCE_CORRECTION_PENDING').length === 0,
);
const rejected = await admin('POST', `/attendance/${correctionId}/decision`, {
  status: 'REJECTED',
  comment: 'Please confirm the time with your lead first',
});
ok('setup: rejected', good(rejected), status(rejected));
const beaDecided = about((await feed(bea)).items, correctionId, 'ATTENDANCE_CORRECTION_DECIDED');
ok('Bea is told', beaDecided.length === 1, `${beaDecided.length}`);
ok('it says rejected', /reject/i.test(beaDecided[0]?.title ?? ''), beaDecided[0]?.title);

console.log('\nemail preference');
const pref = await ada('GET', '/notifications/preferences');
ok('email is on by default', pref.payload?.email === true, status(pref));
const off = await ada('PUT', '/notifications/preferences', { email: false });
ok('Ada turns it off for herself', off.payload?.email === false, status(off));
ok("Bea's is unchanged", (await bea('GET', '/notifications/preferences')).payload?.email === true);
const bad = await ada('PUT', '/notifications/preferences', { email: 'maybe' });
ok('a value that is not yes or no is refused', bad.status === 400, status(bad));
await ada('PUT', '/notifications/preferences', { email: true });

console.log('\nthe screen it is about');
{
  // Bea needs a salary for an advance to fit the limit.
  await admin('POST', '/employees/' + t.b.id + '/compensation', {
    payType: 'SALARY',
    payFrequency: 'MONTHLY',
    baseAmount: 40000,
    currencyCode: 'INR',
    overtimeMultiplier: 1.5,
    effectiveFrom: t.monthStart,
  });
  const before = (await feed(admin)).unreadByModule?.approvals ?? 0;
  const advance = await bea('POST', '/payroll/advances', {
    employeeId: t.b.id,
    requestedAmount: 5000,
    reason: 'Rent due before payday',
  });
  ok('Bea asks for a salary advance', good(advance), status(advance));
  const adminFeed = await feed(admin);
  ok(
    'the administrator is told there is an advance to approve',
    about(adminFeed.items, advance.payload?.id, 'ADVANCE_PENDING').length === 1,
  );
  ok(
    'and Approvals counts one more unread, for the dot on it',
    (adminFeed.unreadByModule?.approvals ?? 0) === before + 1,
    JSON.stringify(adminFeed.unreadByModule),
  );
  const beaUnread = (await feed(bea)).unread;
  const opened = await admin('POST', '/notifications/read-module', { module: 'approvals' });
  ok('opening Approvals reads what is about it', good(opened), status(opened));
  const afterOpen = await feed(admin);
  ok(
    'so Approvals has nothing unread and its dot goes',
    !afterOpen.unreadByModule?.approvals &&
      about(afterOpen.items, advance.payload?.id, 'ADVANCE_PENDING')[0]?.readAt !== null,
    JSON.stringify(afterOpen.unreadByModule),
  );
  ok("Bea's own notifications are untouched", (await feed(bea)).unread === beaUnread);
  const bad = await admin('POST', '/notifications/read-module', { module: 'Approvals; DROP' });
  ok('a screen name that is not one is refused', bad.status === 400, status(bad));

  const decided = await admin('POST', '/payroll/advances/' + advance.payload?.id + '/decision', {
    status: 'REJECTED',
    comment: 'Not this month',
  });
  const beaFeed = await feed(bea);
  ok(
    'Bea is told of the decision, on her payroll screen',
    good(decided) &&
      about(beaFeed.items, advance.payload?.id, 'ADVANCE_DECIDED')[0]?.module === 'payroll' &&
      (beaFeed.unreadByModule?.payroll ?? 0) >= 1,
    JSON.stringify(beaFeed.unreadByModule),
  );
}

console.log('\nmark all read');
const all = await admin('POST', '/notifications/read-all', {});
ok('the administrator marks all theirs read', good(all), status(all));
ok('their unread count is zero', (await feed(admin)).unread === 0);
ok("Bea's is untouched", beaDecided[0] && (await feed(bea)).unread >= 1);

finish();
