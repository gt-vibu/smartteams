import { readFileSync } from 'node:fs';
import type { Prisma } from '../../generated/prisma/client';
import { seedApprovalDefaults } from './organization-roles';

/**
 * Every organization starts with someone who can approve what employees submit.
 *
 * New tenants were created with a leave approval policy and nothing else, so a timesheet or an
 * attendance correction was refused until an administrator found the Approvals screen and built a
 * policy — which nothing in the product told them to do. These pin the defaults: the administrator
 * role approves, until the organization chooses otherwise.
 */

type Captured = { data: Record<string, unknown> };

function fakeTx() {
  const policies: Captured[] = [];
  const steps: Captured[] = [];
  const tx = {
    approvalPolicy: {
      create: (args: Captured) => {
        policies.push(args);
        return Promise.resolve({ id: `policy-${policies.length}` });
      },
    },
    approvalPolicyStep: {
      create: (args: Captured) => {
        steps.push(args);
        return Promise.resolve({ id: `step-${steps.length}` });
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, policies, steps };
}

describe('default approval policies', () => {
  it('route timesheets and attendance corrections to the administrator role', async () => {
    const { tx, policies, steps } = fakeTx();
    await seedApprovalDefaults(tx, 'org-1', 'admin-role');

    expect(policies.map((policy) => policy.data.domain)).toEqual([
      'TIMESHEET',
      'ATTENDANCE_CORRECTION',
    ]);
    for (const policy of policies) {
      // Default and active, or submission still finds no policy to use.
      expect(policy.data).toMatchObject({
        organizationId: 'org-1',
        isDefault: true,
        isActive: true,
      });
    }
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      // The role, not a person: the first administrator may leave, and a policy pointing at them
      // would then approve nothing.
      expect(step.data).toMatchObject({
        organizationId: 'org-1',
        stepNumber: 1,
        approverType: 'ROLE',
        roleId: 'admin-role',
        required: true,
      });
    }
  });

  it('use their own codes, so an organization can replace them without a clash', async () => {
    const { tx, policies } = fakeTx();
    await seedApprovalDefaults(tx, 'org-1', 'admin-role');
    expect(policies.map((policy) => policy.data.code)).toEqual([
      'TIMESHEET_DEFAULT',
      'ATTENDANCE_CORRECTION_DEFAULT',
    ]);
  });
});

describe('both tenant-creation paths seed the default approvers', () => {
  const read = (path: string) => readFileSync(require.resolve(path), 'utf8');

  it('self-service registration calls the shared seeder', () => {
    expect(read('../auth/auth.registration.service.ts')).toContain('seedApprovalDefaults(tx,');
  });

  it('platform onboarding calls the shared seeder', () => {
    expect(read('./organization-onboarding.service.ts')).toContain('seedApprovalDefaults(tx,');
  });

  it('the federation bootstrap does not: a partner organization keeps its own approvals', () => {
    expect(read('./organizations.service.ts')).not.toContain('seedApprovalDefaults');
  });
});
