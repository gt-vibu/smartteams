import { FederationPayrollController } from './federation-payroll.controller';

describe('federation payroll actions', () => {
  it('calculates a draft run instead of only changing its status', async () => {
    const context = { organizationId: 'org' };
    const support = { context: jest.fn().mockResolvedValue(context) };
    const payroll = {
      calculate: jest.fn().mockResolvedValue({ status: 'CALCULATED', employeeCount: 2 }),
      advance: jest.fn(),
    };
    const controller = new FederationPayrollController(
      payroll as never,
      {} as never,
      {} as never,
      support as never,
      {} as never,
    );

    await expect(
      controller.action(
        'run-id',
        'calculate',
        'org',
        { target: 'CALCULATED', comment: 'Calculate payroll' } as never,
        {} as never,
      ),
    ).resolves.toMatchObject({ status: 'CALCULATED', employeeCount: 2 });

    expect(payroll.calculate).toHaveBeenCalledWith(context, 'run-id');
    expect(payroll.advance).not.toHaveBeenCalled();
  });

  it('continues to use state transitions for approval', async () => {
    const context = { organizationId: 'org' };
    const support = { context: jest.fn().mockResolvedValue(context) };
    const payroll = {
      calculate: jest.fn(),
      advance: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
    };
    const controller = new FederationPayrollController(
      payroll as never,
      {} as never,
      {} as never,
      support as never,
      {} as never,
    );

    await controller.action(
      'run-id',
      'approve',
      'org',
      { target: 'APPROVED', comment: 'Approved' } as never,
      {} as never,
    );

    expect(payroll.advance).toHaveBeenCalledWith(context, 'run-id', 'APPROVED', 'Approved');
    expect(payroll.calculate).not.toHaveBeenCalled();
  });
});
