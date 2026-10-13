import { createHash, randomBytes } from 'node:crypto';
import { tenant, rows, good, ok, refused, finish } from './lib/authz-harness.mjs';

const t = await tenant('leave-attachment');
const bytes = randomBytes(4096);
const checksum = createHash('sha256').update(bytes).digest('hex');
const type = rows((await t.org('GET', '/leave/types')).payload).find(
  (item) => item.paid && !item.requiresAttachment,
);
const ticket = await t.a.as('POST', '/files/uploads', {
  purpose: 'LEAVE_ATTACHMENT',
  employeeId: t.a.id,
  originalName: 'leave-evidence.pdf',
  contentType: 'application/pdf',
  byteSize: bytes.length,
  checksumSha256: checksum,
});
ok(
  'employee obtains a leave evidence upload ticket',
  good(ticket),
  'HTTP ' + ticket.status + ': ' + (ticket.payload?.detail ?? ''),
);
if (!good(ticket)) throw new Error('Upload ticket failed');
const put = await fetch(ticket.payload.uploadUrl, {
  method: 'PUT',
  body: bytes,
  headers: {
    'Content-Type': 'application/pdf',
    'x-amz-server-side-encryption': 'AES256',
    'x-amz-checksum-sha256': Buffer.from(checksum, 'hex').toString('base64'),
  },
});
ok('leave evidence bytes upload to real S3', put.status === 200);
const completed = await t.a.as('POST', `/files/${ticket.payload.fileId}/complete`, {
  checksumSha256: checksum,
});
ok('API validates completed leave evidence', good(completed));
const request = await t.a.as('POST', '/leave/requests', {
  employeeId: t.a.id,
  leaveTypeId: type.id,
  startDate: '2026-11-23',
  endDate: '2026-11-23',
  reason: 'Verify real supporting evidence',
  attachmentIds: [ticket.payload.fileId],
});
ok('employee submits leave with real supporting evidence', good(request));
if (!good(request)) throw new Error('Leave submission failed');
const path = `/leave/requests/${request.payload.id}/attachments/${ticket.payload.fileId}/download`;
for (const [label, call] of [
  ['owner', t.a.as],
  ['approver', t.org],
]) {
  const link = await call('POST', path);
  ok(`${label} can review attached evidence`, good(link));
  if (good(link)) {
    const downloaded = await fetch(link.payload.downloadUrl);
    ok(
      `${label} receives exactly the uploaded bytes`,
      downloaded.status === 200 && Buffer.from(await downloaded.arrayBuffer()).equals(bytes),
    );
  }
}
ok('unrelated employee cannot inspect supporting evidence', refused(await t.b.as('POST', path)));
const reuse = await t.a.as('POST', '/leave/requests', {
  employeeId: t.a.id,
  leaveTypeId: type.id,
  startDate: '2026-11-24',
  endDate: '2026-11-24',
  reason: 'Evidence cannot be claimed twice',
  attachmentIds: [ticket.payload.fileId],
});
ok('a second request cannot claim already attached evidence', reuse.status === 409);
finish();
