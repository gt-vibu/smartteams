import { ForbiddenDomainError } from '../../common/errors/domain-error';
import { OrganizationsService } from './organizations.service';

const organization = {
  id: '00000000-0000-4000-a000-000000000010',
  name: 'BlizBooks Hotel',
  slug: 'federated-tenant',
  source: 'BLIZBOOKS',
  externalId: 'blizbooks-tenant-1',
  status: 'ACTIVE',
  timezone: 'Asia/Kolkata',
  currencyCode: 'INR',
  locale: 'en-IN',
  version: 1,
};

function setup(options: { existingOrganization?: boolean; existingGrant?: boolean } = {}) {
  const createOrganization = jest.fn(
    (input: {
      data: {
        name: string;
        slug: string;
        source: string;
        externalId: string;
        timezone: string;
        currencyCode: string;
        status: string;
      };
    }) => {
      void input;
      return Promise.resolve(organization);
    },
  );
  const createGrant = jest.fn(
    (input: {
      data: {
        clientId: string;
        organizationId: string;
        effect: string;
        status: string;
      };
    }) => {
      void input;
      return Promise.resolve({ id: '00000000-0000-4000-a000-000000000020' });
    },
  );
  const tx = {
    $executeRaw: jest.fn(),
    federationClient: {
      findUnique: jest.fn().mockResolvedValue({
        id: '00000000-0000-4000-a000-000000000001',
        status: 'ACTIVE',
        tenantProvisioningEnabled: true,
      }),
    },
    organization: {
      findFirst: jest.fn().mockResolvedValue(options.existingOrganization ? organization : null),
      create: createOrganization,
      update: jest.fn().mockResolvedValue({ ...organization, version: 2 }),
    },
    federationCapability: {
      upsert: jest.fn((input: { where: { code_version: { code: string; version: string } } }) =>
        Promise.resolve({
          id: `${input.where.code_version.code}:${input.where.code_version.version}`,
        }),
      ),
    },
    organizationFederationCapability: { upsert: jest.fn() },
    federationScope: {
      upsert: jest.fn((input: { where: { code: string } }) =>
        Promise.resolve({ id: input.where.code, code: input.where.code }),
      ),
    },
    federationGrant: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.existingGrant ? { id: '00000000-0000-4000-a000-000000000020' } : null,
        ),
      create: createGrant,
    },
    federationGrantScope: { createMany: jest.fn() },
  };
  const database = {
    runFederationBootstrap: jest.fn(
      (_clientId: string, operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx),
    ),
  };
  const audit = { record: jest.fn() };
  const outbox = { append: jest.fn() };
  return {
    tx,
    audit,
    outbox,
    service: new OrganizationsService(database as never, audit, outbox as never),
  };
}

const tenantInput = {
  name: organization.name,
  timezone: organization.timezone,
  currencyCode: organization.currencyCode,
  status: 'ACTIVE' as const,
};

describe('OrganizationsService federation bootstrap', () => {
  it('creates the tenant and its organization-scoped grant for the global client', async () => {
    const { service, tx, audit, outbox } = setup();

    await expect(
      service.bootstrapFederated(
        '00000000-0000-4000-a000-000000000001',
        organization.externalId,
        tenantInput,
      ),
    ).resolves.toMatchObject({ id: organization.id, externalId: organization.externalId });

    expect(tx.organization.create.mock.calls[0]?.[0].data).toMatchObject({
      externalId: organization.externalId,
      source: 'BLIZBOOKS',
    });
    expect(tx.federationGrant.create.mock.calls[0]?.[0].data).toMatchObject({
      clientId: '00000000-0000-4000-a000-000000000001',
      organizationId: organization.id,
      effect: 'ALLOW',
      status: 'ACTIVE',
    });
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(outbox.append).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate an unchanged tenant, grant, audit record, or outbox event on retry', async () => {
    const { service, tx, audit, outbox } = setup({
      existingOrganization: true,
      existingGrant: true,
    });

    await service.bootstrapFederated(
      '00000000-0000-4000-a000-000000000001',
      organization.externalId,
      tenantInput,
    );

    expect(tx.organization.update).not.toHaveBeenCalled();
    expect(tx.federationGrant.create).not.toHaveBeenCalled();
    expect(tx.federationGrantScope.createMany).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
    expect(outbox.append).not.toHaveBeenCalled();
  });

  it('rejects tenant provisioning by a client without global provisioning access', async () => {
    const { service, tx } = setup();
    tx.federationClient.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-a000-000000000001',
      status: 'SUSPENDED',
      tenantProvisioningEnabled: true,
    });

    await expect(
      service.bootstrapFederated(
        '00000000-0000-4000-a000-000000000001',
        organization.externalId,
        tenantInput,
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainError);
    expect(tx.organization.findFirst).not.toHaveBeenCalled();
  });
});
