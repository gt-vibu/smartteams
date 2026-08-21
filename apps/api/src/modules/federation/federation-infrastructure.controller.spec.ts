import { FederationInfrastructureController } from './federation-infrastructure.controller';
import type { FederationRequest } from './federation.types';

describe('FederationInfrastructureController', () => {
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
