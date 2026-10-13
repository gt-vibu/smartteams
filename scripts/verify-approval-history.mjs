import { randomUUID } from 'node:crypto';
import { tenant, good, refused, rows, ok, finish } from './lib/authz-harness.mjs';
const t = await tenant('approval-history');
const type = rows((await t.org('GET', '/leave/types')).payload).find(
  (item) => item.paid && !item.requiresAttachment,
);
const request = await t.a.as('POST', '/leave/requests', {
  employeeId: t.a.id,
  leaveTypeId: type.id,
  startDate: '2026-11-17',
  endDate: '2026-11-17',
  reason: 'Approval history acceptance',
});
if (!good(request)) throw new Error(JSON.stringify(request.payload));
const ids = [];
for (const requestId of [request.payload.id, randomUUID()]) {
  const batchId = randomUUID();
  ids.push(batchId);
  const input = {
    batchId,
    status: 'APPROVED',
    items: [{ id: requestId, domain: 'LEAVE', expectedStepNumber: 1 }],
  };
  const started = await t.org('POST', '/approval-batches', input);
  ok('approval batch accepted and indexed', good(started));
  let result;
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    result = await t.org('GET', `/approval-batches/${batchId}`);
    if (['completed', 'failed'].includes(result.payload?.state)) break;
  }
  ok('approval batch finishes with explicit outcomes', result.payload?.processed === 1);
  const replay = await t.org('POST', '/approval-batches', input);
  ok(
    'replayed approval batch reuses its retained result',
    good(replay) && replay.payload.processed === 1,
  );
}
const history = await t.org('GET', '/approval-batches/history');
ok(
  'history includes completed and failed individual decisions',
  good(history) &&
    history.payload.items.length === 2 &&
    history.payload.items.some((item) => item.batchId === ids[0] && item.failed === 0) &&
    history.payload.items.some((item) => item.batchId === ids[1] && item.failed === 1),
  JSON.stringify(history.payload),
);
const hidden = await t.a.as('GET', '/approval-batches/history');
ok('ordinary employee cannot inspect administrator batch history', refused(hidden));
const analytics = await t.org('GET', '/approval-operations/analytics');
ok(
  'workload counts the recorded manual leave approval',
  good(analytics) &&
    analytics.payload.rows.find((row) => row.domain === 'LEAVE')?.manual === 1 &&
    analytics.payload.rows.find((row) => row.domain === 'LEAVE')?.pending === 0,
);
finish();
