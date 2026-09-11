/**
 * The real file lifecycle, end to end, against real object storage.
 *
 * Separated from `verify-files.mjs` so neither file grows past the point where it can be read in
 * one sitting. That script owns the rules the API applies before it touches storage — purposes,
 * sizes, content types, tenant isolation. This one owns the part that can only be proved by
 * moving bytes.
 *
 * The sequence mirrors production exactly: the browser never sends bytes through the API, so
 * neither does this. The API issues a presigned PUT, the client uploads straight to the store,
 * and the API is then asked to verify what actually landed there.
 */
import { createHash, randomBytes } from 'node:crypto';

/**
 * Everything the presigned URL was signed with has to be sent back.
 *
 * A presigned URL is a signature over one exact request. `StorageService` signs
 * `ServerSideEncryption: AES256`, which puts `x-amz-server-side-encryption` into SignedHeaders —
 * omit it and the store rejects the PUT outright, no matter that the URL is valid and unexpired.
 * The checksum header is not signed but is still required for the store to record a checksum,
 * which is what `completeUpload` later compares against.
 */
function uploadHeaders(contentType, checksumHex) {
  return {
    'Content-Type': contentType,
    'x-amz-server-side-encryption': 'AES256',
    ...(checksumHex
      ? { 'x-amz-checksum-sha256': Buffer.from(checksumHex, 'hex').toString('base64') }
      : {}),
  };
}

/**
 * @param check     assertion helper from the parent script
 * @param contracts the shared zod contracts, so responses are checked against the real schema
 * @param org     issues an authenticated API call for one tenant
 * @param a       the tenant that owns the file
 * @param b       an unrelated tenant, used to prove it cannot reach the file
 */
export async function runRoundTrip({ check, contracts, org, a, b }) {
  // Random bytes rather than a fixed string: a comparison that passes because both sides are
  // empty, or because a buffer was reused, proves nothing.
  const bytes = randomBytes(4096);
  const checksumHex = createHash('sha256').update(bytes).digest('hex');

  let r = await org(a, 'POST', '/files/uploads', {
    purpose: 'EMPLOYEE_DOCUMENT',
    originalName: 'handbook.pdf',
    contentType: 'application/pdf',
    byteSize: bytes.byteLength,
    checksumSha256: checksumHex,
  });
  check('a ticket is issued for a checksummed upload', r.status, [200, 201]);
  const { fileId, uploadUrl, objectKey } = r.payload ?? {};
  check('the ticket carries a presigned upload url', typeof uploadUrl, 'string');

  /*
   * The key is the convention, asserted rather than assumed: tenant-scoped, opaque, and carrying
   * no filename. `handbook.pdf` must not appear in it — the original name is metadata in
   * PostgreSQL, never the object key, or the key would leak what the document is to anyone who
   * can see a storage listing.
   */
  check('the key is tenant-scoped', objectKey?.startsWith(`${a.orgId}/`), true);
  check('the key does not contain the original filename', objectKey?.includes('handbook'), false);

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: bytes,
    headers: uploadHeaders('application/pdf', checksumHex),
  });
  check('the bytes upload straight to object storage', put.status, 200);

  // Before completion the database is still the authority: 200 from the object store is not the
  // same fact as "this file is available".
  r = await org(a, 'POST', `/files/${fileId}/download`);
  check('an uploaded but uncompleted file cannot be downloaded', r.status, [404, 409]);

  r = await org(a, 'POST', `/files/${fileId}/complete`);
  check('completing a real upload succeeds', r.status, [200, 201]);
  check('the file is AVAILABLE', r.payload?.status, 'AVAILABLE');
  check('a storage version was recorded', typeof r.payload?.versionId, 'string');
  /*
   * The browser parses this response as a file. It used to be `{ id, status, versionId }`, which
   * failed that parse, so a successful upload surfaced as "The file response was not valid" while
   * the file itself sat in the list below the error. Checked against the real contract rather
   * than field by field.
   */
  check(
    'the completion response parses as a file for the frontend',
    contracts.parseFileObject(r.payload) !== null,
    true,
  );

  /*
   * The retry case, which is ordinary rather than exotic: the API commits, the connection drops
   * before the response lands, and the browser asks again about a file that did upload. It must
   * get the same answer, not "no such pending file".
   */
  const first = r.payload?.versionId;
  r = await org(a, 'POST', `/files/${fileId}/complete`);
  check('completing twice succeeds', r.status, [200, 201]);
  check('the repeat returns the same version', r.payload?.versionId, first);
  check('and the file is still AVAILABLE', r.payload?.status, 'AVAILABLE');

  r = await org(a, 'POST', `/files/${fileId}/download`);
  check('a completed file can be downloaded', r.status, [200, 201]);
  const downloadUrl = r.payload?.downloadUrl;
  check(
    'the download url is presigned, not public',
    downloadUrl?.includes('X-Amz-Signature'),
    true,
  );

  const got = Buffer.from(await (await fetch(downloadUrl)).arrayBuffer());
  check('the downloaded bytes are the uploaded bytes', got.equals(bytes), true);
  check(
    'the downloaded checksum matches what was declared',
    createHash('sha256').update(got).digest('hex'),
    checksumHex,
  );

  // Cross-tenant, against a file that genuinely exists and is genuinely readable by its owner —
  // the only version of this test that means anything.
  r = await org(b, 'POST', `/files/${fileId}/download`);
  check('another tenant cannot download an available file', r.status, [403, 404]);
  r = await org(b, 'POST', `/files/${fileId}/delete`, { reason: 'Not mine to delete' });
  check('nor delete it', r.status, [403, 404]);

  r = await org(a, 'GET', '/files');
  check(
    'the owner lists the file',
    (r.payload ?? []).some((f) => f.id === fileId),
    true,
  );
  check(
    'byteSize survives the BigInt boundary as a string',
    typeof (r.payload ?? []).find((f) => f.id === fileId)?.byteSize,
    'string',
  );

  r = await org(a, 'POST', `/files/${fileId}/delete`, { reason: 'Uploaded in error' });
  check('the owner can delete it', r.status, [200, 201]);
  r = await org(a, 'POST', `/files/${fileId}/download`);
  check('a deleted file cannot be downloaded', r.status, [404, 409]);
  r = await org(a, 'GET', '/files');
  check(
    'a deleted file leaves the listing',
    (r.payload ?? []).some((f) => f.id === fileId),
    false,
  );

  /*
   * Deletion is two-stage by design: the row is DELETED and a purge job removes the object after
   * the retention window. The object is therefore still expected to exist right now, and the
   * presigned URL issued before deletion still works — a presigned URL is a ticket the store
   * honours until it expires, and revoking it is not something the application can do. That is
   * the reason the TTL is short, and it is worth stating rather than discovering later.
   */
  const afterDelete = await fetch(downloadUrl);
  check('the object itself is retained for the purge window', afterDelete.status, 200);
}
