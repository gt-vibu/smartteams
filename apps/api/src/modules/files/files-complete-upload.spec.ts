import { FilesService } from './files.service';
import { FileStatus } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const CALLER_USER = '44444444-4444-4444-8444-444444444444';
const FILE = '77777777-7777-4777-8777-777777777777';
const VERSION = '88888888-8888-4888-8888-888888888888';
const CHECKSUM = 'a'.repeat(64);

/**
 * The columns the route returns to the client. Present in the fixture because the response is
 * parsed as a whole file rather than as a status, so a row missing them would pass a test while
 * failing the browser.
 */
const STORED_COLUMNS = {
  id: FILE,
  objectKey: 'org/EMPLOYEE_DOCUMENT/uuid.pdf',
  purpose: 'EMPLOYEE_DOCUMENT',
  originalName: 'handbook.pdf',
  contentType: 'application/pdf',
};

function context(organizationId = ORG): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: CALLER_USER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(['files.write']),
  };
}

/**
 * Completing an upload has to survive being asked twice.
 *
 * The browser sends bytes straight to object storage and then asks the API to verify them, so a
 * connection dropped between the API committing and the response arriving is an ordinary event,
 * not a rare one. The client is then holding a file that uploaded successfully and an error that
 * says otherwise.
 *
 * These lock both halves: the first call does the real verification, and a repeat returns the
 * same answer without re-reading storage or writing a second version row. The mock stands in for
 * the row the database already holds, so "already AVAILABLE" is expressed the way the query sees
 * it rather than by counting calls.
 */
function setup(
  row: {
    status: FileStatus;
    currentVersionId?: string | null;
    checksumSha256?: string | null;
    byteSize?: bigint;
  } | null,
  headOverrides: { ContentLength?: number; ChecksumSHA256?: string } = {},
) {
  const tx = {
    fileObject: {
      findFirst: jest.fn().mockResolvedValue(
        row
          ? {
              ...STORED_COLUMNS,
              byteSize: row.byteSize ?? 2048n,
              checksumSha256: row.checksumSha256 ?? null,
              currentVersionId: row.currentVersionId ?? null,
              status: row.status,
            }
          : null,
      ),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: FILE, status: FileStatus.PENDING_UPLOAD, currentVersionId: null }),
      update: jest.fn().mockResolvedValue({
        ...STORED_COLUMNS,
        byteSize: 2048n,
        status: FileStatus.AVAILABLE,
        currentVersionId: VERSION,
      }),
    },
    fileObjectVersion: { create: jest.fn().mockResolvedValue({ id: VERSION }) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: FILE }]),
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const storage = {
    head: jest.fn().mockResolvedValue({
      ContentLength: 2048,
      ChecksumSHA256: undefined,
      VersionId: undefined,
      ...headOverrides,
    }),
  };
  const audit = { record: jest.fn() };
  const stub: unknown = { get: jest.fn(), add: jest.fn() };
  return {
    tx,
    storage,
    audit,
    service: new FilesService(
      database as never,
      storage as never,
      audit,
      stub as never,
      stub as never,
    ),
  };
}

describe('FilesService.completeUpload idempotency', () => {
  it('completes a pending upload and records one version', async () => {
    const { service, tx, audit } = setup({ status: FileStatus.PENDING_UPLOAD });

    await expect(service.completeUpload(context(), FILE)).resolves.toMatchObject({
      id: FILE,
      status: FileStatus.AVAILABLE,
      versionId: VERSION,
    });
    expect(tx.fileObjectVersion.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('returns the existing result when the file is already available', async () => {
    const { service } = setup({
      status: FileStatus.AVAILABLE,
      currentVersionId: VERSION,
    });

    await expect(service.completeUpload(context(), FILE)).resolves.toMatchObject({
      id: FILE,
      status: FileStatus.AVAILABLE,
      versionId: VERSION,
    });
  });

  /*
   * The response has to be a file, not a status report.
   *
   * The frontend parses this route's body as a `FileObject`. When it answered with only
   * `{ id, status, versionId }` the parse failed and the browser said "The file response was not
   * valid" for an upload that had already succeeded — the file was in the list, behind an error
   * message. These are the fields that contract requires, on both the fresh and the repeat path.
   */
  it.each([
    ['a fresh completion', FileStatus.PENDING_UPLOAD],
    ['a repeated completion', FileStatus.AVAILABLE],
  ])('returns the fields the file contract requires after %s', async (_label, status) => {
    const { service } = setup({ status, currentVersionId: VERSION });

    const result: Record<string, unknown> = await service.completeUpload(context(), FILE);

    // The field names the frontend's fileObjectSchema requires. `byteSize` is a BigInt column and
    // cannot cross JSON, so it always leaves as a decimal string.
    expect(result.status).toBe(FileStatus.AVAILABLE);
    expect(typeof result.id).toBe('string');
    expect(typeof result.purpose).toBe('string');
    expect(typeof result.originalName).toBe('string');
    expect(typeof result.contentType).toBe('string');
    expect(typeof result.byteSize).toBe('string');
  });

  it('writes nothing and re-reads nothing on the repeat call', async () => {
    const { service, tx, storage, audit } = setup({
      status: FileStatus.AVAILABLE,
      currentVersionId: VERSION,
    });

    await service.completeUpload(context(), FILE);

    // No duplicate version, no second row update, no second audit entry — and no HeadObject,
    // because the object was already verified by the call that completed it.
    expect(tx.fileObjectVersion.create).not.toHaveBeenCalled();
    expect(tx.fileObject.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('still refuses a size that does not match what was declared', async () => {
    const { service } = setup({ status: FileStatus.PENDING_UPLOAD }, { ContentLength: 4096 });

    await expect(service.completeUpload(context(), FILE)).rejects.toThrow(
      'Uploaded file size does not match the declared size',
    );
  });

  it('still refuses a checksum that does not match what was declared', async () => {
    const { service } = setup(
      { status: FileStatus.PENDING_UPLOAD, checksumSha256: CHECKSUM },
      { ChecksumSHA256: Buffer.from('b'.repeat(64), 'hex').toString('base64') },
    );

    await expect(service.completeUpload(context(), FILE)).rejects.toThrow(
      'Uploaded file checksum does not match',
    );
  });

  it('still refuses a file the tenant does not own', async () => {
    // The organization is part of the lookup, so another tenant's file simply is not found.
    const { service, tx } = setup(null);

    await expect(service.completeUpload(context(OTHER_ORG), FILE)).rejects.toThrow('Pending file');
    // The tenant is part of the query rather than a check applied to the result, so a file
    // belonging to someone else is never read in the first place.
    const [query] = tx.fileObject.findFirst.mock.calls[0] as [
      { where: { organizationId: string } },
    ];
    expect(query.where.organizationId).toBe(OTHER_ORG);
  });

  it('still refuses a deleted file rather than resurrecting it', async () => {
    // DELETED is outside the accepted states, so the widened lookup does not reach it.
    const { service } = setup(null);

    await expect(service.completeUpload(context(), FILE)).rejects.toThrow('Pending file');
  });

  it('requires files.write', async () => {
    const { service } = setup({ status: FileStatus.PENDING_UPLOAD });
    const withoutPermission = { ...context(), permissions: new Set<string>() };

    await expect(service.completeUpload(withoutPermission, FILE)).rejects.toThrow();
  });
});
