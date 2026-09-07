import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PayComponentCalculationType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { dateOnly } from './payroll-calculation';
import { employeeScope } from './payroll-shared';
import { markPayrollStale } from './payroll-staleness';
import {
  hasDefaultValue,
  validateComponentInput,
  type ComponentInput,
} from './payroll-component-rules';

export type { ComponentInput };

/**
 * The pay component catalogue, and which components apply to which employee.
 *
 * One concern: what a component *is* and who it is attached to. How much it comes to on a given
 * run belongs to the calculator, which is why that lives elsewhere.
 */
@Injectable()
export class PayrollComponentsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async createComponent(context: DomainContext, input: ComponentInput) {
    requirePermission(context, 'payroll.components.write');
    validateComponentInput(input);
    return this.database.run(context, async (tx) => {
      const component = await tx.payComponent.create({
        data: {
          organizationId: context.organizationId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          componentType: input.componentType,
          calculationType: input.calculationType,
          formulaDefinition:
            input.formulaDefinition === undefined
              ? undefined
              : jsonSnapshot(input.formulaDefinition),
          isTaxable: input.isTaxable,
          displayOrder: input.displayOrder ?? 0,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAY_COMPONENT',
          entityId: component.id,
          action: 'PAY_COMPONENT_CREATED',
          afterState: jsonSnapshot(component),
        },
        tx,
      );
      return component;
    });
  }

  async listComponents(context: DomainContext) {
    requirePermission(context, 'payroll.components.read');
    return this.database.run(context, (tx) =>
      tx.payComponent.findMany({
        where: { organizationId: context.organizationId, isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
    );
  }

  async updateComponent(context: DomainContext, id: string, input: ComponentInput) {
    requirePermission(context, 'payroll.components.write');
    validateComponentInput(input);
    return this.database.run(context, async (tx) => {
      const existing = await tx.payComponent.findFirst({
        where: { id, organizationId: context.organizationId, isActive: true },
      });
      if (!existing) throw new NotFoundError('Pay component');
      const component = await tx.payComponent.update({
        where: { id: existing.id },
        data: {
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          componentType: input.componentType,
          calculationType: input.calculationType,
          formulaDefinition:
            input.formulaDefinition === undefined
              ? Prisma.JsonNull
              : jsonSnapshot(input.formulaDefinition),
          isTaxable: input.isTaxable,
          displayOrder: input.displayOrder ?? 0,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'PAY_COMPONENT',
          entityId: component.id,
          action: 'PAY_COMPONENT_UPDATED',
          beforeState: jsonSnapshot(existing),
          afterState: jsonSnapshot(component),
        },
        tx,
      );
      return component;
    });
  }

  async listEmployeeComponents(context: DomainContext, employeeId: string) {
    requirePermission(context, 'payroll.components.read');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          organizationId: context.organizationId,
          ...employeeScope(context),
        },
        select: { id: true },
      });
      if (!employee) throw new NotFoundError('Employee');
      return tx.employeePayComponent.findMany({
        where: { organizationId: context.organizationId, employeeId },
        include: { payComponent: true },
        orderBy: [{ effectiveFrom: 'desc' }, { payComponent: { displayOrder: 'asc' } }],
      });
    });
  }

  async assignComponent(
    context: DomainContext,
    input: {
      employeeId: string;
      payComponentId: string;
      amount?: number;
      percentage?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    },
  ) {
    requirePermission(context, 'payroll.components.write');
    return this.database.run(context, async (tx) => {
      const [employee, component] = await Promise.all([
        tx.employee.findFirst({
          where: {
            id: input.employeeId,
            organizationId: context.organizationId,
            status: 'ACTIVE',
            ...employeeScope(context),
          },
        }),
        tx.payComponent.findFirst({
          where: {
            id: input.payComponentId,
            organizationId: context.organizationId,
            isActive: true,
          },
        }),
      ]);
      if (!employee) throw new NotFoundError('Employee');
      if (!component) throw new NotFoundError('Pay component');
      if (input.amount !== undefined && input.percentage !== undefined)
        throw new ConflictError('Pay component assignment cannot set both amount and percentage');
      if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount < 0))
        throw new ConflictError('Pay component amount must be a non-negative number');
      if (
        input.percentage !== undefined &&
        (!Number.isFinite(input.percentage) || input.percentage < 0 || input.percentage > 100)
      )
        throw new ConflictError('Pay component percentage must be between 0 and 100');
      if (
        component.calculationType === PayComponentCalculationType.FIXED &&
        input.amount === undefined &&
        !hasDefaultValue(component.formulaDefinition, 'FIXED')
      )
        throw new ConflictError('Fixed pay component requires an amount');
      if (
        component.calculationType === PayComponentCalculationType.PERCENTAGE_OF_BASE &&
        input.percentage === undefined &&
        !hasDefaultValue(component.formulaDefinition, 'PERCENTAGE_OF_BASE')
      )
        throw new ConflictError('Percentage pay component requires a percentage');
      const effectiveFrom = dateOnly(input.effectiveFrom);
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : undefined;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Pay component assignment end must not precede its start');
      const overlap = await tx.employeePayComponent.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          payComponentId: component.id,
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) throw new ConflictError('Pay component assignments must not overlap');
      const assignment = await tx.employeePayComponent.create({
        data: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          payComponentId: component.id,
          amount: input.amount,
          percentage: input.percentage,
          effectiveFrom,
          effectiveTo,
          sourceAccessMode: context.accessMode,
        },
      });
      // Assigned components are summed into gross earnings or deductions, so a calculated run
      // inside the assignment's window no longer reflects the components it should carry.
      await markPayrollStale(tx, context.organizationId, effectiveFrom, effectiveTo);
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_PAY_COMPONENT',
          entityId: assignment.id,
          action: 'PAY_COMPONENT_ASSIGNED',
          afterState: jsonSnapshot(assignment),
        },
        tx,
      );
      return assignment;
    });
  }
}
