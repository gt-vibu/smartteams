import { FederationInfrastructureController } from './federation-infrastructure.controller';
import type { FederationRequest } from './federation.types';

describe('FederationInfrastructureController', () => {
  it('bootstraps a tenant for the authenticated global federation client', async () => {
    const requireFederation = jest
      .fn()
      .mockReturnValue({ clientInternalId: 'client-1', clientId: 'blizbooks-stg' });
    const bootstrapFederated = jest.fn().mockResolvedValue({ id: 'organization-1' });
    const controller = new FederationInfrastructureController(
      undefined as never,
      undefined as never,
      { requireFederation } as never,
      { bootstrapFederated } as never,
      undefined as never,
      undefined as never,
    );
    const request = {} as FederationRequest;
    const body = {
      name: 'BlizBooks Hotel',
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
    };

    await controller.tenant('blizbooks-tenant-1', body, request);

    expect(requireFederation).toHaveBeenCalledWith(request);
    expect(bootstrapFederated).toHaveBeenCalledWith('client-1', 'blizbooks-tenant-1', body);
  });

  it('authorizes branch provisioning at organization scope before creating the branch', async () => {
    const target = jest.fn().mockResolvedValue({ organizationId: 'organization-1' });
    const context = jest.fn().mockResolvedValue({});
    const syncFederatedBranch = jest.fn().mockResolvedValue({ id: 'branch-1' });
    const controller = new FederationInfrastructureController(
      undefined as never,
      undefined as never,
      { target, context } as never,
      { syncFederatedBranch } as never,
      undefined as never,
      undefined as never,
    );
    const request = {} as FederationRequest;

    const body = { name: 'Outlet' };
    await controller.branch('external-organization-1', 'external-branch-1', body, request);

    expect(target).toHaveBeenCalledWith(
      request,
      'external-organization-1',
      undefined,
      'branches.write',
    );
    expect(context).toHaveBeenCalledWith(request, 'organization-1', 'branches.write');
    expect(syncFederatedBranch).toHaveBeenCalledWith(
      {},
      'external-organization-1',
      'external-branch-1',
      body,
    );
  });
});
