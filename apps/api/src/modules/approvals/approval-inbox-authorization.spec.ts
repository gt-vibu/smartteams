import { ApproverType } from '../../generated/prisma/enums';
import { canApprove, type ApprovalAuthorizationCache } from './approval-authorization';

it('resolves shared role authority once for a large inbox while decisions recheck it', async () => {
  const tx = {
    approvalDelegation: { findMany: jest.fn().mockResolvedValue([]) },
    userRole: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment' }) },
  };
  const cache: ApprovalAuthorizationCache = new Map();
  for (let index = 0; index < 1000; index++)
    expect(
      await canApprove(
        tx as never,
        'org',
        'approver',
        null,
        ApproverType.ROLE,
        'role',
        null,
        'branch',
        `employee-${index}`,
        cache,
      ),
    ).toBe(true);
  expect(tx.approvalDelegation.findMany).toHaveBeenCalledTimes(1);
  expect(tx.userRole.findFirst).toHaveBeenCalledTimes(1);
  expect(
    await canApprove(
      tx as never,
      'org',
      'approver',
      null,
      ApproverType.ROLE,
      'role',
      null,
      'branch',
      'approver',
      cache,
    ),
  ).toBe(false);
  tx.userRole.findFirst.mockResolvedValueOnce(null);
  expect(
    await canApprove(
      tx as never,
      'org',
      'approver',
      null,
      ApproverType.ROLE,
      'role',
      null,
      'branch',
      'employee-1',
    ),
  ).toBe(false);
});
