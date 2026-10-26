import { Injectable, Optional } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { EmployeeRecordsService } from '../employees/employee-records.service';
import { LeaveService } from '../leave/leave.service';
import { PayrollPolicySettingsService } from '../payroll/payroll-policy-settings.service';
import { ShiftsService } from '../shifts/shifts.service';
import type { WorkforcePreviewDto } from './workforce.dto';
import { digest, WorkforcePlanService, type WorkforceRow } from './workforce-plan.service';
import { authorizeWorkforce } from './workforce-selection';
import { PayrollPolicyService } from '../payroll/payroll-policy.service';

@Injectable()
export class WorkforceApplyService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly plans: WorkforcePlanService,
    private readonly records: EmployeeRecordsService,
    private readonly leave: LeaveService,
    private readonly shifts: ShiftsService,
    private readonly payrollSettings: PayrollPolicySettingsService,
    @Optional() private readonly payrollPolicy?: PayrollPolicyService,
  ) {}

  async apply(
    context: DomainContext,
    input: WorkforcePreviewDto,
    row: WorkforceRow,
    targetRevision: string,
  ) {
    authorizeWorkforce(context, input.operation);
    const from = new Date(`${input.effectiveFrom}T00:00:00Z`);
    const checked = await this.database.run(context, async (tx) => {
      const target = await this.plans.target(tx, context, input);
      if (target.revision !== targetRevision)
        throw new ConflictError('The selected configuration changed. Preview again.');
      if (input.operation === 'SALARY' && await tx.payrollRun.count({
        where: {
          organizationId: context.organizationId,
          periodEnd: { gte: from },
          status: { in: ['RELEASED', 'LOCKED'] },
        },
      }))
        throw new ConflictError('Released payroll covers this date. Open an authorized correction run first.');
      if (input.operation === 'LEAVE_POLICY') {
        const branch = await tx.branch.findFirst({
          where: { organizationId: context.organizationId, id: row.id, status: 'ACTIVE' },
          select: { id: true, name: true, updatedAt: true },
        });
        if (!branch || digest(branch) !== row.revision)
          throw new ConflictError('Branch changed since preview.');
        const type = await tx.leaveType.findFirst({
          where: { organizationId: context.organizationId, id: input.targetId, isActive: true },
        });
        if (!type) throw new NotFoundError('Leave type');
        return { branchCode: type.code, person: null, payroll: null };
      }
      const person = await tx.employee.findFirst({
        where: {
          organizationId: context.organizationId,
          id: row.id,
          status: 'ACTIVE',
          ...(context.branchId ? { primaryBranchId: context.branchId } : {}),
        },
        select: {
          id: true,
          version: true,
          managerEmployeeId: true,
          shifts: {
            where: { OR: [{ endsOn: null }, { endsOn: { gte: from } }] },
            orderBy: { id: 'asc' },
            select: { id: true, shiftId: true, startsOn: true, endsOn: true },
          },
          payrollPolicies: {
            where: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] },
            orderBy: { effectiveFrom: 'asc' },
          },
          ...(input.operation === 'SALARY'
            ? {
                compensations: {
                  where: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] },
                  orderBy: { effectiveFrom: 'asc' },
                },
              }
            : {}),
        },
      });
      if (!person) throw new NotFoundError('Active employee');
      const alreadyApplied =
        input.operation === 'SALARY'
          ? Boolean(
              input.salary &&
                person.compensations.some(
                  (item) =>
                    item.effectiveFrom.getTime() === from.getTime() &&
                    Number(item.grossSalary ?? item.baseAmount) === input.salary!.grossSalary,
                ) &&
                person.payrollPolicies.some(
                  (item) =>
                    item.effectiveFrom.getTime() === from.getTime() &&
                    item.payrollEnabled &&
                    item.salarySlipMode === 'ENABLED' &&
                    item.pfEnabled === input.salary!.pfEnabled &&
                    item.esiEnabled === input.salary!.esiEnabled &&
                    item.ptEnabled === input.salary!.ptEnabled,
                ),
            )
          : input.operation === 'MANAGER'
          ? person.managerEmployeeId === input.targetId
          : input.operation === 'SHIFT'
            ? person.shifts.some(
                (item) =>
                  item.shiftId === input.targetId &&
                  item.startsOn.getTime() === from.getTime() &&
                  !item.endsOn,
              )
            : person.payrollPolicies.some(
                (item) =>
                  item.payrollPolicyId === input.targetId &&
                  item.effectiveFrom.getTime() === from.getTime(),
              );
      if (
        !alreadyApplied &&
        digest({
          version: person.version,
          shifts: person.shifts,
          payroll: person.payrollPolicies,
          ...(input.operation === 'SALARY' ? { compensations: person.compensations } : {}),
        }) !== row.revision
      )
        throw new ConflictError(
          'Employee setup changed since preview. Review this employee again.',
        );
      const payroll =
        input.operation === 'PAYROLL_POLICY'
          ? await tx.payrollPolicy.findFirst({
              where: { organizationId: context.organizationId, id: input.targetId },
            })
          : null;
      return { person, payroll, branchCode: null, alreadyApplied };
    });
    if ('alreadyApplied' in checked && checked.alreadyApplied) return;
    if (input.operation === 'LEAVE_POLICY') {
      await this.leave.assignTypeToBranch({ ...context, branchId: row.id }, checked.branchCode!);
    } else if (input.operation === 'MANAGER') {
      await this.records.assignManager(context, row.id, input.targetId);
    } else if (input.operation === 'SHIFT') {
      await this.shifts.assign(context, row.id, {
        shiftId: input.targetId,
        startsOn: input.effectiveFrom,
      });
    } else if (input.operation === 'SALARY') {
      const salary = input.salary;
      if (!salary || !this.payrollPolicy)
        throw new ConflictError('Salary assignment is unavailable. Contact your payroll administrator.');
      await this.payrollPolicy.saveSalaryProfile(context, {
        employeeId: row.id,
        grossSalary: salary.grossSalary,
        payType: 'SALARY',
        payFrequency: 'MONTHLY',
        overtimeMultiplier: 1.5,
        effectiveFrom: input.effectiveFrom,
        payrollEnabled: true,
        salarySlipMode: 'ENABLED',
        pfEnabled: salary.pfEnabled,
        esiEnabled: salary.esiEnabled,
        ptEnabled: salary.ptEnabled,
      });
    } else {
      const policy = checked.payroll!;
      const existing = checked.person!.payrollPolicies.find(
        (item) => item.effectiveFrom <= from && (!item.effectiveTo || item.effectiveTo >= from),
      );
      await this.payrollSettings.saveEmployeePolicy(context, {
        employeeId: row.id,
        effectiveFrom: input.effectiveFrom,
        payrollPolicyId: policy.id,
        payrollEnabled: existing?.payrollEnabled ?? policy.payrollEnabledDefault,
        salarySlipMode:
          existing?.salarySlipMode ?? (policy.salarySlipDefault ? 'ENABLED' : 'DISABLED'),
        pfEnabled: existing?.pfEnabled ?? policy.pfDefault,
        esiEnabled: existing?.esiEnabled ?? policy.esiDefault,
        ptEnabled: existing?.ptEnabled ?? policy.ptDefault,
        statutoryJurisdiction:
          existing?.statutoryJurisdiction ?? policy.statutoryJurisdiction ?? undefined,
      });
    }
  }
}
