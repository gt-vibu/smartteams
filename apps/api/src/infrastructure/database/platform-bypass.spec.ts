import { ForbiddenDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from './tenant-database.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * `runPlatform` is the RLS bypass. It is deliberately unusable without an identified operator
 * and a stated reason, so every privileged read is attributable in the audit trail.
 *
 * The failure mode this guards against is subtle: a caller that forgets `reason` does not get a
 * type error, it gets a 403 at runtime that looks exactly like a missing permission. That is
 * what made `listPlatform` show "You are not authorized" to a fully authorized super admin.
 */
function setup() {
  const tx = {
    $executeRaw: jest.fn(),
    organization: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    platform: { $transaction: jest.fn((cb: (c: unknown) => unknown) => Promise.resolve(cb(tx))) },
  };
  return { tx, service: new TenantDatabaseService(prisma as never) };
}

const OPERATOR = '44444444-4444-4444-8444-444444444444';

function platformContext(overrides: Partial<DomainContext> = {}) {
  return {
    accessMode: 'PLATFORM',
    actor: { type: 'PLATFORM_OPERATOR', userId: OPERATOR },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set<string>(['*']),
    reason: 'Platform tenant directory listing',
    ...overrides,
  } as DomainContext;
}

describe('TenantDatabaseService.runPlatform', () => {
  it('permits an operator who states a reason', async () => {
    const { service } = setup();
    await expect(service.runPlatform(platformContext(), () => Promise.resolve('ok'))).resolves.toBe(
      'ok',
    );
  });

  it('refuses when the reason is missing', async () => {
    const { service } = setup();
    await expect(
      service.runPlatform(platformContext({ reason: undefined }), () => Promise.resolve('ok')),
    ).rejects.toThrow(ForbiddenDomainError);
  });

  it('refuses when the reason is only whitespace', async () => {
    const { service } = setup();
    await expect(
      service.runPlatform(platformContext({ reason: '   ' }), () => Promise.resolve('ok')),
    ).rejects.toThrow(ForbiddenDomainError);
  });

  it('refuses when no operator is attributable', async () => {
    const { service } = setup();
    await expect(
      service.runPlatform(platformContext({ actor: { type: 'PLATFORM_OPERATOR' } }), () =>
        Promise.resolve('ok'),
      ),
    ).rejects.toThrow(ForbiddenDomainError);
  });

  it('refuses a non-platform access mode', async () => {
    const { service } = setup();
    await expect(
      service.runPlatform(platformContext({ accessMode: 'NATIVE' }), () => Promise.resolve('ok')),
    ).rejects.toThrow(ForbiddenDomainError);
  });
});
