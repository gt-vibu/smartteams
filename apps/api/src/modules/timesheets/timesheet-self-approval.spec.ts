import { TimesheetLifecycleService } from './timesheet-lifecycle.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Nobody approves their own hours.
 *
 * Leave requests and attendance corrections pass the requester to `assertApprover`, which refuses
 * a requester deciding their own item. Timesheets did not, so a manager who logged time — or the
 * user named on a USER approval step — could approve their own sheet, and approved sheets are what
 * payroll pays for.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SHEET = '22222222-2222-4222-8222-222222222222';
const PERIOD = '33333333-3333-4333-8333-333333333333';
const APPROVER = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE_USER = '55555555-5555-4555-8555-555555555555';
const STEP = '66666666-6666-4666-8666-666666666666';

function context(accessMode: DomainContext['accessMode'] = 'NATIVE'): DomainContext {
  return {
    organizationId: ORG,
    accessMode,
    actor: { type: 'USER', userId: APPROVER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(['timesheets.decide']),
  };
}

function setup(sheetOwnerUserId: string, step: { approverType: string; approverUserId?: string }) {
  const tx = {
    timesheet: {
      findFirst: jest.fn().mockResolvedValue({
        id: SHEET,
        organizationId: ORG,
        timesheetPeriodId: PERIOD,
        branchId: 'branch',
        status: 'SUBMITTED',
        approvals: [],
        approvalPolicy: {
          steps: [
            {
              id: STEP,
              stepNumber: 1,
              approverType: step.approverType,
              roleId: null,
              approverUserId: step.approverUserId ?? null,
            },
          ],
        },
        employee: { userId: sheetOwnerUserId, manager: { userId: APPROVER } },
      }),
      update: jest.fn().mockResolvedValue({ id: SHEET, version: 2, status: 'APPROVED' }),
    },
    // The approver's own employee record, which `canApprove` requires to be active.
    employee: { findFirst: jest.fn().mockResolvedValue({ id: 'approver-employee' }) },
    timesheetPeriod: {
      findUnique: jest.fn().mockResolvedValue({
        periodStart: new Date('2026-09-01'),
        periodEnd: new Date('2026-09-30'),
      }),
    },
    payrollRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };
  return {
    tx,
    service: new TimesheetLifecycleService(database as never, audit, outbox as never),
  };
}

describe('TimesheetLifecycleService.decide self-approval', () => {
  it('refuses a manager approving their own timesheet', async () => {
    // The approver is both the sheet's owner and, on paper, its manager.
    const { tx, service } = setup(APPROVER, { approverType: 'MANAGER' });

    await expect(service.decide(context(), SHEET, 'APPROVED', 'Looks right to me')).rejects.toThrow(
      'You cannot approve your own timesheet',
    );
    expect(tx.timesheet.update).not.toHaveBeenCalled();
  });

  it('refuses the named approver of a USER step approving their own timesheet', async () => {
    const { tx, service } = setup(APPROVER, { approverType: 'USER', approverUserId: APPROVER });

    await expect(service.decide(context(), SHEET, 'APPROVED', 'Approving')).rejects.toThrow(
      'You cannot approve your own timesheet',
    );
    expect(tx.timesheet.update).not.toHaveBeenCalled();
  });

  it("still lets the manager approve their report's timesheet", async () => {
    const { tx, service } = setup(EMPLOYEE_USER, { approverType: 'MANAGER' });

    await service.decide(context(), SHEET, 'APPROVED', 'Hours match the project log');
    expect(tx.timesheet.update).toHaveBeenCalled();
  });

  it('still refuses someone who is not the step approver', async () => {
    const { tx, service } = setup(EMPLOYEE_USER, {
      approverType: 'USER',
      approverUserId: '77777777-7777-4777-8777-777777777777',
    });

    await expect(service.decide(context(), SHEET, 'APPROVED', 'Approving')).rejects.toThrow(
      'not authorized for this approval step',
    );
    expect(tx.timesheet.update).not.toHaveBeenCalled();
  });

  it('leaves federated decisions as the frozen Federation contract has them', async () => {
    // The partner names the approver through its own workflow; the self-approval rule is native.
    const { tx, service } = setup(APPROVER, { approverType: 'MANAGER' });

    await service.decide(context('FEDERATION'), SHEET, 'APPROVED', 'Decided in BlizBooks');
    expect(tx.timesheet.update).toHaveBeenCalled();
  });
});
