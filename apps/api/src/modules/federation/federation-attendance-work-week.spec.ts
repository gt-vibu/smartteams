import type { DomainContext } from '../../common/context/domain-context';
import type { FederationRequest } from './federation.types';
import { FederationAttendanceController } from './federation-attendance.controller';

describe('federated attendance work-week settings', () => {
  const context = {} as DomainContext;
  const request = { federation: {} } as FederationRequest;
  const workWeek = {
    get: jest.fn(),
    update: jest.fn(),
  };
  const support = { context: jest.fn() };
  const controller = new FederationAttendanceController(
    {} as never,
    workWeek as never,
    {} as never,
    {} as never,
    support as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires the attendance preferences read grant to view payroll attendance rules', async () => {
    const rules = { workWeekDays: [1, 2, 3, 4, 5], unmarkedDaysAreAbsent: true };
    support.context.mockResolvedValue(context);
    workWeek.get.mockResolvedValue(rules);

    await expect(controller.workWeekSettings('organization-1', request)).resolves.toEqual(rules);
    expect(support.context).toHaveBeenCalledWith(
      request,
      'organization-1',
      'attendance.preferences.read',
    );
    expect(workWeek.get).toHaveBeenCalledWith(context, 'attendance.preferences.read');
  });

  it('requires the attendance preferences write grant to update payroll attendance rules', async () => {
    const rules = { workWeekDays: [1, 2, 3, 4, 5, 6], unmarkedDaysAreAbsent: false };
    support.context.mockResolvedValue(context);
    workWeek.update.mockResolvedValue(rules);

    await expect(
      controller.updateWorkWeekSettings(
        'organization-1',
        { workWeekDays: rules.workWeekDays, unmarkedDaysAreAbsent: false },
        request,
      ),
    ).resolves.toEqual(rules);
    expect(support.context).toHaveBeenCalledWith(
      request,
      'organization-1',
      'attendance.preferences.write',
    );
    expect(workWeek.update).toHaveBeenCalledWith(context, rules.workWeekDays, false);
  });
});
