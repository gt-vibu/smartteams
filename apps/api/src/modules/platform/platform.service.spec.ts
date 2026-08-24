import { FederationClientStatus, FederationEnvironment } from '../../generated/prisma/enums';
import { ConflictError } from '../../common/errors/domain-error';
import { PlatformService } from './platform.service';
import { BadRequestException } from '@nestjs/common';

const client = {
  id: '00000000-0000-4000-a000-000000000001',
  name: 'BlizBooks Staging',
  clientId: 'blizbooks-stg',
  environment: FederationEnvironment.STAGING,
  status: FederationClientStatus.ACTIVE,
  mtlsRequired: true,
  allowedCertificateFingerprints: ['a'.repeat(64)],
  createdAt: new Date('2026-08-24T00:00:00.000Z'),
  updatedAt: new Date('2026-08-24T00:00:00.000Z'),
};

function setup(overrides: Record<string, unknown> = {}) {
  const createClient = jest.fn(
    (input: {
      data: {
        clientId: string;
        environment: FederationEnvironment;
        status: FederationClientStatus;
        tenantProvisioningEnabled: boolean;
      };
    }) => {
      void input;
      return Promise.resolve(client);
    },
  );
  const updateCredentials = jest.fn((input: { where: { clientId: string; status: string } }) =>
    Promise.resolve({ count: input.where.clientId ? 1 : 0 }),
  );
  const tx = {
    federationClient: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: createClient,
      update: jest.fn(),
    },
    federationClientCredential: { updateMany: updateCredentials },
    federationGrant: { updateMany: jest.fn() },
    webhookSubscription: { updateMany: jest.fn() },
    ...overrides,
  };
  const database = {
    runPlatform: jest.fn(
      (_context: unknown, operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx),
    ),
  };
  const auth = {
    createCredential: jest.fn().mockResolvedValue({
      id: '00000000-0000-4000-a000-000000000002',
      keyId: 'key-1',
      clientSecret: 'secret-value',
    }),
  };
  const audit = { record: jest.fn() };
  return {
    tx,
    auth,
    service: new PlatformService(database as never, auth as never, audit),
  };
}

describe('PlatformService federation clients', () => {
  it('creates the operator-supplied global client and returns its secret once', async () => {
    const { service, tx, auth } = setup();
    tx.federationClient.findUnique.mockResolvedValue(null);
    const result = await service.createClient('operator-1', {
      name: client.name,
      clientId: client.clientId,
      environment: FederationEnvironment.STAGING,
      isActive: true,
      mtlsRequired: true,
      allowedCertificateFingerprints: [Array.from({ length: 32 }, () => 'AA').join(':')],
    });

    expect(tx.federationClient.create.mock.calls[0]?.[0].data).toMatchObject({
      clientId: 'blizbooks-stg',
      environment: FederationEnvironment.STAGING,
      status: FederationClientStatus.ACTIVE,
      tenantProvisioningEnabled: true,
    });
    expect(auth.createCredential).toHaveBeenCalledWith(client.id, 'operator-1', undefined, tx);
    expect(result.clientSecret).toBe('secret-value');
  });

  it('rotates the secret, revokes older credentials, and invalidates issued tokens', async () => {
    const { service, tx } = setup();
    tx.federationClient.findUnique.mockResolvedValue(client);
    tx.federationClient.update.mockResolvedValue({ ...client, tokenVersion: 1 });

    const result = await service.rotateCredential('operator-1', client.id);

    expect(tx.federationClientCredential.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      clientId: client.id,
      status: 'ACTIVE',
    });
    expect(tx.federationClient.update).toHaveBeenCalledWith({
      where: { id: client.id },
      data: { tokenVersion: { increment: 1 } },
    });
    expect(result.clientSecret).toBe('secret-value');
  });

  it('requires an active client to be disabled before deletion', async () => {
    const { service, tx } = setup();
    tx.federationClient.findUnique.mockResolvedValue(client);

    await expect(service.deleteClient('operator-1', client.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(tx.federationClient.update).not.toHaveBeenCalled();
  });

  it('updates certificate fingerprints and invalidates issued tokens', async () => {
    const { service, tx } = setup();
    tx.federationClient.findUnique.mockResolvedValue(client);
    tx.federationClient.update.mockResolvedValue({
      ...client,
      allowedCertificateFingerprints: ['b'.repeat(64)],
    });

    await service.updateCertificateFingerprints('operator-1', client.id, {
      mtlsRequired: true,
      allowedCertificateFingerprints: [Array.from({ length: 32 }, () => 'BB').join(':')],
    });

    expect(tx.federationClient.update).toHaveBeenCalledWith({
      where: { id: client.id },
      data: {
        mtlsRequired: true,
        allowedCertificateFingerprints: ['b'.repeat(64)],
        tokenVersion: { increment: 1 },
      },
    });
  });

  it('revokes a disabled client, its credentials, grants, and webhooks', async () => {
    const { service, tx } = setup();
    const suspended = { ...client, status: FederationClientStatus.SUSPENDED };
    tx.federationClient.findUnique.mockResolvedValue(suspended);
    tx.federationClient.update.mockResolvedValue({
      ...suspended,
      status: FederationClientStatus.REVOKED,
    });

    await expect(service.deleteClient('operator-1', client.id)).resolves.toEqual({
      id: client.id,
      deleted: true,
    });

    expect(tx.federationClientCredential.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.federationGrant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.webhookSubscription.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.federationClient.update).toHaveBeenCalledTimes(1);
  });

  it('enables a suspended client and invalidates previously issued tokens', async () => {
    const { service, tx } = setup();
    const suspended = { ...client, status: FederationClientStatus.SUSPENDED };
    tx.federationClient.findUnique.mockResolvedValue(suspended);
    tx.federationClient.update.mockResolvedValue(client);

    await service.setClientEnabled('operator-1', client.id, true);

    expect(tx.federationClient.update).toHaveBeenCalledWith({
      where: { id: client.id },
      data: {
        status: FederationClientStatus.ACTIVE,
        tokenVersion: { increment: 1 },
      },
    });
  });

  it('does not permit OAuth-only production clients', async () => {
    const { service } = setup();

    await expect(
      service.createClient('operator-1', {
        name: client.name,
        clientId: client.clientId,
        environment: FederationEnvironment.PRODUCTION,
        isActive: true,
        mtlsRequired: false,
        allowedCertificateFingerprints: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
