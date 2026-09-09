import { FilesService } from './files.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { AccessMode } from '../../generated/prisma/enums';

const ORG = '11111111-1111-4111-8111-111111111111';
const CALLER_USER = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE_A = '55555555-5555-4555-8555-555555555555';
const EMPLOYEE_B = '66666666-6666-4666-8666-666666666666';
const FILE = '77777777-7777-4777-8777-777777777777';

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

/**
 * `download` used to check only `files.read` and the organization, so any colleague's payslip or
 * leave attachment was reachable by anyone who knew its id. These lock the boundary that closed
 * it, including the deliberate choice to report a file the caller may not read as missing rather
 * than forbidden.
 */
function setup(file: { employeeId: string | null } | null, self: { id: string } | null) {
  const tx = {
    fileObject: {
      findFirst: jest.fn().mockResolvedValue(file ? { id: FILE, objectKey: 'k', ...file } : null),
    },
    employee: { findFirst: jest.fn().mockResolvedValue(self) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const storage: unknown = {
    createDownloadUrl: jest.fn().mockResolvedValue('https://storage.example/get'),
  };
  const stub: unknown = { record: jest.fn(), get: jest.fn(), add: jest.fn() };
  return {
    tx,
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

describe('FilesService.download self-scoping', () => {
  it('lets an employee download their own file', async () => {
    const { service } = setup({ employeeId: EMPLOYEE_A }, { id: EMPLOYEE_A });
    await expect(service.download(context(['files.read']), FILE)).resolves.toMatchObject({
      fileId: FILE,
    });
  });

  it("refuses another employee's file", async () => {
    const { service } = setup({ employeeId: EMPLOYEE_B }, { id: EMPLOYEE_A });
    await expect(service.download(context(['files.read']), FILE)).rejects.toThrow('File');
  });

  it('refuses a file that belongs to no employee', async () => {
    // A payroll export or organization document is nobody's own file.
    const { service } = setup({ employeeId: null }, { id: EMPLOYEE_A });
    await expect(service.download(context(['files.read']), FILE)).rejects.toThrow('File');
  });

  it('refuses when the caller has no employee record', async () => {
    const { service } = setup({ employeeId: EMPLOYEE_A }, null);
    await expect(service.download(context(['files.read']), FILE)).rejects.toThrow('File');
  });

  it('lets files.read.all reach any file in the tenant', async () => {
    const { tx, service } = setup({ employeeId: EMPLOYEE_B }, { id: EMPLOYEE_A });
    await expect(
      service.download(context(['files.read', 'files.read.all']), FILE),
    ).resolves.toMatchObject({ fileId: FILE });
    // The ownership lookup is skipped entirely for a caller allowed to read everything.
    expect(tx.employee.findFirst).not.toHaveBeenCalled();
  });

  it('leaves the wildcard admin unrestricted', async () => {
    const { service } = setup({ employeeId: EMPLOYEE_B }, { id: EMPLOYEE_A });
    await expect(service.download(context(['*']), FILE)).resolves.toMatchObject({ fileId: FILE });
  });

  it('keeps the federation read breadth its grant already carries', async () => {
    const { service } = setup({ employeeId: EMPLOYEE_B }, null);
    await expect(
      service.download(
        context(['files.read'], {
          accessMode: 'FEDERATION' as AccessMode,
          actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
        }),
        FILE,
      ),
    ).resolves.toMatchObject({ fileId: FILE });
  });

  it('still refuses a file from another tenant', async () => {
    const { service } = setup(null, { id: EMPLOYEE_A });
    await expect(service.download(context(['*']), FILE)).rejects.toThrow('File');
  });
});

/**
 * Deleting is a strictly greater power than reading, and used to be the least guarded of the
 * three: `softDelete` checked `files.write` and the organisation only, so an employee holding the
 * self-service write permission could destroy a colleague's payslip from its id alone. It is now
 * governed by the same self/all split as list and download.
 */
function deleteSetup(file: { employeeId: string | null } | null, self: { id: string } | null) {
  const tx = {
    fileObject: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          file ? { id: FILE, objectKey: 'k', status: 'AVAILABLE', ...file } : null,
        ),
      // `toFileDto` stringifies `byteSize`, so the updated row must carry the bigint the
      // real column returns.
      update: jest.fn().mockResolvedValue({ id: FILE, status: 'DELETED', byteSize: 1024n }),
    },
    employee: { findFirst: jest.fn().mockResolvedValue(self) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const stub: unknown = {
    record: jest.fn(),
    get: jest.fn().mockReturnValue(30),
    add: jest.fn(),
    createDownloadUrl: jest.fn(),
  };
  return {
    tx,
    service: new FilesService(
      database as never,
      stub as never,
      stub as never,
      stub as never,
      stub as never,
    ),
  };
}

const REASON = 'Removing a document that was uploaded in error';

describe('FilesService.softDelete self-scoping', () => {
  it('lets an employee delete their own file', async () => {
    const { tx, service } = deleteSetup({ employeeId: EMPLOYEE_A }, { id: EMPLOYEE_A });
    await service.softDelete(context(['files.write']), FILE, REASON);
    expect(tx.fileObject.update).toHaveBeenCalled();
  });

  it("refuses to delete another employee's file", async () => {
    const { tx, service } = deleteSetup({ employeeId: EMPLOYEE_B }, { id: EMPLOYEE_A });
    await expect(service.softDelete(context(['files.write']), FILE, REASON)).rejects.toThrow();
    expect(tx.fileObject.update).not.toHaveBeenCalled();
  });

  it('refuses to delete a file that belongs to no employee', async () => {
    // An organisation-level document has no owner for a self-scoped caller to match, so only a
    // caller with breadth may remove it.
    const { tx, service } = deleteSetup({ employeeId: null }, { id: EMPLOYEE_A });
    await expect(service.softDelete(context(['files.write']), FILE, REASON)).rejects.toThrow();
    expect(tx.fileObject.update).not.toHaveBeenCalled();
  });

  it('refuses when the caller has no employee record', async () => {
    const { tx, service } = deleteSetup({ employeeId: EMPLOYEE_A }, null);
    await expect(service.softDelete(context(['files.write']), FILE, REASON)).rejects.toThrow();
    expect(tx.fileObject.update).not.toHaveBeenCalled();
  });

  it('lets files.read.all delete any file in the tenant', async () => {
    const { tx, service } = deleteSetup({ employeeId: EMPLOYEE_B }, { id: EMPLOYEE_A });
    await service.softDelete(context(['files.write', 'files.read.all']), FILE, REASON);
    expect(tx.fileObject.update).toHaveBeenCalled();
  });

  it('leaves the wildcard admin unrestricted', async () => {
    const { tx, service } = deleteSetup({ employeeId: EMPLOYEE_B }, null);
    await service.softDelete(context(['*']), FILE, REASON);
    expect(tx.fileObject.update).toHaveBeenCalled();
  });

  it('keeps federation deletion breadth its grant already carries', async () => {
    const { tx, service } = deleteSetup({ employeeId: EMPLOYEE_B }, null);
    await service.softDelete(
      context(['files.write'], {
        accessMode: 'FEDERATION' as AccessMode,
        actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
      }),
      FILE,
      REASON,
    );
    expect(tx.fileObject.update).toHaveBeenCalled();
  });

  it('still refuses a file from another tenant', async () => {
    // The row lookup is organisation-scoped, so a foreign file is simply absent.
    const { tx, service } = deleteSetup(null, { id: EMPLOYEE_A });
    await expect(service.softDelete(context(['files.write']), FILE, REASON)).rejects.toThrow();
    expect(tx.fileObject.update).not.toHaveBeenCalled();
  });
});
