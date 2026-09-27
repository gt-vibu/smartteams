#!/usr/bin/env node
/**
 * Resignations — against the running API.
 *
 * Ada hands in her resignation; the administrator is told and accepts it with a last working day,
 * which becomes her date of leaving; Ada is told. She can withdraw it until then, which clears the
 * date. Nobody decides their own, an employee cannot see others', and a second open one is refused.
 *
 *   pnpm verify:resignations
 */
import { finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const status = (r) => 'HTTP ' + r.status + (good(r) ? '' : ' ' + (r.payload?.detail ?? ''));
const t = await tenant('rs');
const iso = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const kinds = async (as) =>
  ((await as('GET', '/notifications')).payload?.items ?? []).map((item) => item.kind);

console.log('handing it in');
const past = await t.a.as('POST', '/resignations', {
  reason: 'Moving city',
  requestedLastDay: iso(-3),
});
ok('a last day in the past is refused', past.status === 409, status(past));
const handed = await t.a.as('POST', '/resignations', {
  reason: 'Moving to another city',
  requestedLastDay: iso(30),
});
ok('Ada resigns with a last day a month out', good(handed), status(handed));
ok('it waits for a decision', handed.payload?.status === 'PENDING');
const again = await t.a.as('POST', '/resignations', { reason: 'Again', requestedLastDay: iso(40) });
ok('a second open resignation is refused', again.status === 409, status(again));
ok('the administrator is told', (await kinds(t.org)).includes('RESIGNATION_SUBMITTED'));
const mine = await t.a.as('GET', '/resignations/mine');
ok('Ada sees her own', rows(mine.payload).length === 1);
const everyone = await t.a.as('GET', '/resignations');
ok("but not everyone's", refused(everyone), status(everyone));

console.log('\ndeciding');
const bea = await t.b.as('POST', `/resignations/${handed.payload?.id}/decision`, { accept: true });
ok('a colleague cannot accept it', refused(bea), status(bea));
const noReason = await t.org('POST', `/resignations/${handed.payload?.id}/decision`, {
  accept: false,
});
ok('declining needs a reason', noReason.status === 409, status(noReason));
const accepted = await t.org('POST', `/resignations/${handed.payload?.id}/decision`, {
  accept: true,
  lastWorkingDay: iso(21),
  comment: 'Three weeks notice agreed',
});
ok('the administrator accepts it with an agreed last day', good(accepted), status(accepted));
ok('the agreed day is recorded', accepted.payload?.lastWorkingDay === iso(21));
const leaving = async () =>
  /"dateOfLeaving":"([\d-]{10})/.exec(
    JSON.stringify((await t.org('GET', `/employees/${t.a.id}/detail`)).payload),
  )?.[1] ?? null;
const profileDate = await leaving();
ok('and becomes her date of leaving', profileDate === iso(21), profileDate);
ok('Ada is told', (await kinds(t.a.as)).includes('RESIGNATION_DECIDED'));
const twice = await t.org('POST', `/resignations/${handed.payload?.id}/decision`, {
  accept: false,
  comment: 'Changed my mind',
});
ok('a decided resignation cannot be decided again', twice.status === 409, status(twice));

console.log('\nwithdrawing');
const byBea = await t.b.as('POST', `/resignations/${handed.payload?.id}/withdraw`, {});
ok('only Ada can withdraw hers', byBea.status === 404, status(byBea));
const withdrawn = await t.a.as('POST', `/resignations/${handed.payload?.id}/withdraw`, {});
ok('Ada withdraws it before her last day', good(withdrawn), status(withdrawn));
const afterDate = await leaving();
ok('her date of leaving is cleared', afterDate === null, afterDate);
const fresh = await t.a.as('POST', '/resignations', { reason: 'Final', requestedLastDay: iso(30) });
ok('and she can hand in a new one later', good(fresh), status(fresh));

finish();
