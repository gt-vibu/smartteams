import { FilesService } from './files.service';
import { FileStatus } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import type { AccessMode } from '../../generated/prisma/enums';

/**
 * Who may upload a file, and against whom.
 *
 * `files.write` is a self-service permission, and `beginUpload` used to accept any employee id or
 * leave request in the tenant and any purpose. An employee could attach documents to a colleague's
 * record, add attachments to a colleague's leave request, and file a "payslip" under anyone's name.
 * Completing an upload was not tied to whoever began it either.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const CALLER_USER = '44444444-4444-4444-8444-444444444444';
const SELF = '55555555-5555-4555-8555-555555555555';
const COLLEAGUE = '66666666-6666-4666-8666-666666666666';
const LEAVE = '77777777-7777-4777-8777-777777777777';
const FILE = '88888888-8888-4888-8888-888888888888';

function context(permissions: string[], overrides: Partial<DomainContext> = {}): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: CALLER_USER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
    ...overrides,
  };
}

const federation = (permissions: string[]) =>
  context(permissions, {
    accessMode: 'FEDERATION' as AccessMode,
    actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
  });

function setup(leaveOwner = SELF) {
  const tx = {
    employee: {
      findFirst: jest.fn((args: { where: { id?: string; userId?: string } }) =>
        Promise.resolve(
          args.where.userId === CALLER_USER
            ? { id: SELF }
            : args.where.id === SELF || args.where.id === COLLEAGUE
              ? { id: args.where.id }
              : null,
        ),
      ),
    },
    leaveRequest: {
      findFirst: jest.fn().mockResolvedValue({ id: LEAVE, employeeId: leaveOwner }),
    },
    fileObject: {
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: FILE, ...args.data }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const storage = {
    createObjectKey: jest.fn().mockReturnValue('org/EMPLOYEE_DOCUMENT/key.pdf'),
    getBucket: jest.fn().mockReturnValue('bucket'),
    createUploadUrl: jest.fn().mockResolvedValue('https://storage.example/put'),
  };
  const stub: unknown = { record: jest.fn(), get: jest.fn(), add: jest.fn() };
  return {
    tx,
    storage,
    // (database, storage, audit, config, lifecycleQueue)
    service: new FilesService(
      database as never,
      storage as never,
      stub as never,
      stub as never,
      stub as never,
    ),
  };
}

const document = (extra: Record<string, unknown> = {}) => ({
  purpose: 'EMPLOYEE_DOCUMENT' as const,
  originalName: 'offer-letter.pdf',
  contentType: 'application/pdf',
  byteSize: 2048,
  ...extra,
});

const createdEmployee = (tx: ReturnType<typeof setup>['tx']) =>
  (tx.fileObject.create.mock.calls[0]?.[0] as { data: { employeeId?: string } }).data.employeeId;

describe('FilesService.beginUpload scoping', () => {
  it("files a self-service upload against the caller's own record", async () => {
    const { tx, service } = setup();
    await service.beginUpload(context(['files.write']), document({ employeeId: SELF }));
    expect(createdEmployee(tx)).toBe(SELF);
  });

  it('attributes an upload that named nobody to the caller, so they can read it back', async () => {
    const { tx, service } = setup();
    await service.beginUpload(context(['files.write']), document());
    expect(createdEmployee(tx)).toBe(SELF);
  });

  it("refuses an upload against a colleague's record", async () => {
    const { tx, storage, service } = setup();
    await expect(
      service.beginUpload(context(['files.write']), document({ employeeId: COLLEAGUE })),
    ).rejects.toThrow('You may only act on your own records');
    expect(tx.fileObject.create).not.toHaveBeenCalled();
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses an attachment on a colleague's leave request", async () => {
    const { tx, service } = setup(COLLEAGUE);
    await expect(
      service.beginUpload(
        context(['files.write']),
        document({ purpose: 'LEAVE_ATTACHMENT', leaveRequestId: LEAVE }),
      ),
    ).rejects.toThrow('does not match the leave request');
    expect(tx.fileObject.create).not.toHaveBeenCalled();
  });

  it.each(['PAYSLIP', 'PAYROLL_EXPORT', 'IMPORT'])(
    'refuses a self-service %s upload',
    async (purpose) => {
      const { tx, service } = setup();
      await expect(
        service.beginUpload(context(['files.write']), document({ purpose, employeeId: SELF })),
      ).rejects.toThrow('Only file administrators may upload this kind of file');
      expect(tx.fileObject.create).not.toHaveBeenCalled();
    },
  );

  it("lets a file administrator upload to a colleague's record", async () => {
    const { tx, service } = setup();
    await service.beginUpload(
      context(['files.write', 'files.read.all']),
      document({ employeeId: COLLEAGUE }),
    );
    expect(createdEmployee(tx)).toBe(COLLEAGUE);
  });

  it('keeps federation uploads as they were, organization purposes included', async () => {
    const { tx, service } = setup();
    await service.beginUpload(
      federation(['files.write']),
      document({ purpose: 'PAYSLIP', employeeId: COLLEAGUE }),
    );
    expect(createdEmployee(tx)).toBe(COLLEAGUE);
  });
});

describe('FilesService.completeUpload scoping', () => {
  const where = (tx: ReturnType<typeof setup>['tx']) => {
    const [call] = tx.fileObject.findFirst.mock.calls as [{ where: Record<string, unknown> }][];
    return call?.[0].where ?? {};
  };

  it('only finds an upload the self-service caller began', async () => {
    const { tx, service } = setup();
    await expect(service.completeUpload(context(['files.write']), FILE)).rejects.toThrow(
      'Pending file',
    );
    expect(where(tx)).toMatchObject({ uploadedByUserId: CALLER_USER });
    expect(where(tx).status).toEqual({
      in: [FileStatus.PENDING_UPLOAD, FileStatus.AVAILABLE],
    });
  });

  it('does not narrow a file administrator', async () => {
    const { tx, service } = setup();
    await expect(
      service.completeUpload(context(['files.write', 'files.read.all']), FILE),
    ).rejects.toThrow('Pending file');
    expect(where(tx)).not.toHaveProperty('uploadedByUserId');
  });

  it('does not narrow a federation client', async () => {
    const { tx, service } = setup();
    await expect(service.completeUpload(federation(['files.write']), FILE)).rejects.toThrow(
      'Pending file',
    );
    expect(where(tx)).not.toHaveProperty('uploadedByUserId');
  });
});
