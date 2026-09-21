#!/usr/bin/env node
/**
 * One employee, several branches: exactly one primary at a time, any number of additional ones,
 * and a history that is never overwritten.
 *
 * Covers adding and ending an additional branch, a transfer today and one scheduled for later,
 * cancelling a scheduled transfer, the edit form changing the primary, attendance only at a branch
 * the person belongs to that day, leaving the company, and deactivating a branch people depend on.
 *
 *   pnpm verify:employee-branches
 */
import { finish, good, ok, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('eb');
const stamp = Date.now() % 100000;

const shift = (days) => {
  const d = new Date(`${t.today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const branch = async (name) =>
  (
    await t.org('POST', '/branches', {
      name: `${name} ${stamp}`,
      code: `${name.slice(0, 3).toUpperCase()}${stamp}`,
    })
  ).payload;
const history = async (employee) =>
  rows((await t.org('GET', `/employees/${employee.id}/branches`)).payload);
const primaries = (list) => list.filter((row) => row.relationship === 'PRIMARY');
const activePrimaries = (list) => primaries(list).filter((row) => row.state === 'ACTIVE');
const record = async (employee) => (await t.org('GET', `/employees/${employee.id}`)).payload;

const hq = { id: t.branchId };
const whitefield = await branch('Whitefield');
const mysuru = await branch('Mysuru');
ok('setup: two more branches exist', Boolean(whitefield?.id && mysuru?.id));

console.log('\nthe primary has a history row from joining');
let list = await history(t.a);
ok('the employee has exactly one primary', primaries(list).length === 1, JSON.stringify(list));
ok('and it is active', activePrimaries(list).length === 1, list[0]?.state);

console.log('\nadditional branches');
let r = await t.org('POST', `/employees/${t.a.id}/branches`, {
  branchId: whitefield.id,
  startsOn: shift(-10),
});
ok('an additional branch is added', good(r), status(r));
list = await history(t.a);
ok(
  'it is listed as additional, alongside the primary',
  list.some((row) => row.branchId === whitefield.id && row.relationship === 'ADDITIONAL') &&
    activePrimaries(list).length === 1,
  JSON.stringify(list.map((row) => [row.branchName, row.relationship, row.state])),
);
r = await t.org('POST', `/employees/${t.a.id}/branches`, {
  branchId: whitefield.id,
  startsOn: shift(-5),
});
ok('the same branch twice over the same dates is refused', r.status === 409, status(r));
r = await t.org('POST', `/employees/${t.a.id}/branches`, { branchId: hq.id, startsOn: shift(-5) });
ok('the primary branch cannot also be added as additional', r.status === 409, status(r));
r = await t.org('POST', `/employees/${t.a.id}/branches`, {
  branchId: mysuru.id,
  startsOn: '2025-06-01',
});
ok('a branch cannot start before the person joined', r.status === 409, status(r));
r = await t.org('POST', `/employees/${t.a.id}/branches`, {
  branchId: mysuru.id,
  startsOn: shift(5),
  endsOn: shift(1),
});
ok('nor end before it starts', r.status === 409, status(r));

console.log('\nattendance only where they belong that day');
const punchAt = (branchId) =>
  t.org('POST', '/attendance/check-ins', {
    employeeId: t.a.id,
    occurredAt: `${shift(-2)}T09:00:00+05:30`,
    workDate: shift(-2),
    branchId,
  });
r = await punchAt(mysuru.id);
ok('a check-in at a branch they do not belong to is refused', r.status === 409, status(r));
r = await punchAt(whitefield.id);
ok('a check-in at their additional branch is accepted', good(r), status(r));
const day = rows(
  (await t.org('GET', `/attendance?employeeId=${t.a.id}&from=${shift(-2)}&to=${shift(-2)}`))
    .payload,
)[0];
ok('and the day is filed under that branch', day?.branchId === whitefield.id, day?.branchId);

console.log('\nending an additional branch');
const extra = (await history(t.a)).find((row) => row.branchId === whitefield.id);
r = await t.org('POST', `/employees/${t.a.id}/branches/${extra?.id}/end`, { endsOn: shift(-11) });
ok('it cannot end before it began', r.status === 409, status(r));
r = await t.org('POST', `/employees/${t.a.id}/branches/${extra?.id}/end`, { endsOn: t.today });
ok('it ends today', good(r), status(r));
const primaryRow = activePrimaries(await history(t.a))[0];
r = await t.org('POST', `/employees/${t.a.id}/branches/${primaryRow?.id}/end`, { endsOn: t.today });
ok('the primary cannot simply end', r.status === 409, status(r));

console.log('\na transfer effective today');
r = await t.org('POST', `/employees/${t.b.id}/branches/transfer`, {
  branchId: mysuru.id,
  effectiveFrom: t.today,
});
ok('the transfer is accepted', good(r), status(r));
list = await history(t.b);
ok(
  'there is still exactly one active primary',
  activePrimaries(list).length === 1,
  JSON.stringify(list),
);
ok('and it is the new branch', activePrimaries(list)[0]?.branchId === mysuru.id);
const old = primaries(list).find((row) => row.branchId === hq.id);
ok('the old primary is kept, ending yesterday', old?.endsOn === shift(-1), old?.endsOn);
ok('the employee record moved with it', (await record(t.b))?.primaryBranchId === mysuru.id);
r = await t.org('POST', `/employees/${t.b.id}/branches/transfer`, {
  branchId: mysuru.id,
  effectiveFrom: t.today,
});
ok('transferring to the branch they are already on changes nothing', good(r), status(r));
ok('still one active primary', activePrimaries(await history(t.b)).length === 1);

console.log('\na transfer scheduled for later, then cancelled');
const later = shift(10);
r = await t.org('POST', `/employees/${t.b.id}/branches/transfer`, {
  branchId: whitefield.id,
  effectiveFrom: later,
});
ok('a future transfer is accepted', good(r), status(r));
list = await history(t.b);
ok(
  'it is upcoming',
  list.some((row) => row.branchId === whitefield.id && row.state === 'UPCOMING'),
);
ok(
  'the current primary stays current until then',
  activePrimaries(list)[0]?.branchId === mysuru.id &&
    (await record(t.b))?.primaryBranchId === mysuru.id,
);
r = await t.org('POST', `/employees/${t.b.id}/branches/transfer`, {
  branchId: hq.id,
  effectiveFrom: shift(20),
});
ok('a second transfer while one is scheduled is refused', r.status === 409, status(r));
const scheduled = list.find((row) => row.branchId === whitefield.id && row.state === 'UPCOMING');
r = await t.org('POST', `/employees/${t.b.id}/branches/${scheduled?.id}/cancel`, {});
ok('the scheduled transfer is cancelled', good(r), status(r));
list = await history(t.b);
const restored = activePrimaries(list)[0];
ok(
  'and the current primary is open-ended again',
  restored?.branchId === mysuru.id && restored?.endsOn === null,
  JSON.stringify(restored),
);
const active = list.find((row) => row.state === 'ACTIVE' && row.relationship === 'PRIMARY');
r = await t.org('POST', `/employees/${t.b.id}/branches/${active?.id}/cancel`, {});
ok('a membership already running cannot be cancelled', r.status === 409, status(r));

console.log('\nthe edit form changing the primary');
const current = await record(t.a);
r = await t.orgRaw(
  'PATCH',
  `/employees/${t.a.id}`,
  { primaryBranchId: mysuru.id },
  { 'if-match-version': String(current.version) },
);
ok('the edit is accepted', good(r), status(r));
list = await history(t.a);
ok('it is recorded as a transfer, one active primary', activePrimaries(list).length === 1);
ok('at the new branch', activePrimaries(list)[0]?.branchId === mysuru.id);
ok('with the previous primary kept as history', primaries(list).length === 2, JSON.stringify(list));

console.log('\nconcurrency: two transfers at once');
const [x1, x2] = await Promise.all([
  t.org('POST', `/employees/${t.a.id}/branches/transfer`, {
    branchId: hq.id,
    effectiveFrom: shift(3),
  }),
  t.org('POST', `/employees/${t.a.id}/branches/transfer`, {
    branchId: whitefield.id,
    effectiveFrom: shift(3),
  }),
]);
ok(
  'only one is scheduled',
  [x1.status, x2.status].filter((s) => s === 200 || s === 201).length === 1,
  `${x1.status} and ${x2.status}`,
);
list = await history(t.a);
ok(
  'and there is one upcoming primary',
  primaries(list).filter((row) => row.state === 'UPCOMING').length === 1,
);

console.log('\ndeactivating a branch people depend on');
r = await t.org('POST', `/branches/${mysuru.id}/deactivate`, {
  reason: 'Closing the Mysuru office',
});
ok('a branch that is still someone’s primary cannot be deactivated', r.status === 409, status(r));

console.log('\nleaving the company');
r = await t.org('POST', `/employees/${t.b.id}/deactivate`, {
  reason: 'Leaving at the end of the suite',
});
ok('the employee leaves', good(r), status(r));
list = await history(t.b);
ok(
  'no membership is left running',
  list.every((row) => row.state !== 'UPCOMING' && row.endsOn !== null),
  JSON.stringify(list),
);
ok('the history is still there', primaries(list).length >= 2, `${list.length} rows`);
r = await t.org('POST', `/employees/${t.b.id}/branches`, { branchId: hq.id, startsOn: t.today });
ok('a former employee cannot be given a branch', r.status === 409, status(r));

console.log('\nacross tenants');
const other = await tenant('ex');
r = await other.org('GET', `/employees/${t.a.id}/branches`);
ok(
  "another tenant cannot read this employee's branches",
  r.status === 404 || r.status === 403,
  status(r),
);

finish();
