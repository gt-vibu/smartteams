import { Injectable } from '@nestjs/common';
import { type LeaveAccrualType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { toTypeDto } from './leave-shared';
import { provisionBalancesForAll } from './leave-balance-ops';

type LeaveTypeInput = {
  code: string;
  name: string;
  paid: boolean;
  accrualType: LeaveAccrualType;
  annualAllowance?: number;
  monthlyAccrual?: number;
  carryoverLimit?: number;
  requiresAttachment: boolean;
};

/**
 * The leave type catalogue and its assignment to branches.
 *
 * Configuration rather than transaction: what kinds of leave exist, how they accrue, and which
 * branches offer them. Assigning a type to a branch opens balances for everyone in it, which is
 * the one place this file reaches into balance work.
 */
@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async createType(context: DomainContext, input: LeaveTypeInput) {
    requirePermission(context, 'leave.types.write');
    return this.database.run(context, async (tx) => {
      const type = await tx.leaveType.create({
        data: {
          organizationId: context.organizationId,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          paid: input.paid,
          accrualType: input.accrualType,
          annualAllowance: input.annualAllowance,
          monthlyAccrual: input.monthlyAccrual,
          carryoverLimit: input.carryoverLimit,
          requiresAttachment: input.requiresAttachment,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_TYPE',
          entityId: type.id,
          action: 'LEAVE_TYPE_CREATED',
          afterState: jsonSnapshot(type),
        },
        tx,
      );
      return toTypeDto(type);
    });
  }

  async listTypes(context: DomainContext) {
    requirePermission(context, 'leave.types.read');
    return this.database.run(context, (tx) =>
      tx.leaveType
        .findMany({
          where: { organizationId: context.organizationId, isActive: true },
          orderBy: { code: 'asc' },
        })
        .then((types) => types.map((type) => toTypeDto(type))),
    );
  }

  async syncType(context: DomainContext, code: string, input: LeaveTypeInput) {
    requirePermission(context, 'leave.types.write');
    return this.database.run(context, async (tx) => {
      const codeValue = code.trim().toUpperCase();
      const before = await tx.leaveType.findUnique({
        where: { organizationId_code: { organizationId: context.organizationId, code: codeValue } },
      });
      const type = await tx.leaveType.upsert({
        where: { organizationId_code: { organizationId: context.organizationId, code: codeValue } },
        create: {
          organizationId: context.organizationId,
          code: codeValue,
          name: input.name.trim(),
          paid: input.paid,
          accrualType: input.accrualType,
          annualAllowance: input.annualAllowance,
          monthlyAccrual: input.monthlyAccrual,
          carryoverLimit: input.carryoverLimit,
          requiresAttachment: input.requiresAttachment,
        },
        update: {
          name: input.name.trim(),
          paid: input.paid,
          accrualType: input.accrualType,
          annualAllowance: input.annualAllowance,
          monthlyAccrual: input.monthlyAccrual,
          carryoverLimit: input.carryoverLimit,
          requiresAttachment: input.requiresAttachment,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_TYPE',
          entityId: type.id,
          action: before ? 'LEAVE_TYPE_SYNCED' : 'LEAVE_TYPE_PROVISIONED',
          beforeState: before ? jsonSnapshot(before) : undefined,
          afterState: jsonSnapshot(type),
        },
        tx,
      );
      return toTypeDto(type);
    });
  }

  async assignTypeToBranch(context: DomainContext, code: string) {
    requirePermission(context, 'leave.types.write');
    if (!context.branchId) throw new ConflictError('A branch is required to assign a leave policy');
    return this.database.run(context, async (tx) => {
      const [branch, type, settings] = await Promise.all([
        tx.branch.findFirst({
          where: { id: context.branchId, organizationId: context.organizationId, status: 'ACTIVE' },
        }),
        tx.leaveType.findFirst({
          where: {
            organizationId: context.organizationId,
            code: code.trim().toUpperCase(),
            isActive: true,
          },
        }),
        tx.organizationSettings.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        }),
      ]);
      if (!branch) throw new NotFoundError('Branch');
      if (!type) throw new NotFoundError('Leave type');

      const assignment = await tx.leavePolicyAssignment.upsert({
        where: {
          organizationId_branchId_leaveTypeId: {
            organizationId: context.organizationId,
            branchId: branch.id,
            leaveTypeId: type.id,
          },
        },
        create: {
          organizationId: context.organizationId,
          branchId: branch.id,
          leaveTypeId: type.id,
          sourceAccessMode: context.accessMode,
        },
        update: { sourceAccessMode: context.accessMode },
        include: { leaveType: true, branch: { select: { id: true, name: true, code: true } } },
      });
      const employees = await tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          OR: [
            { primaryBranchId: branch.id },
            { branchAssignments: { some: { branchId: branch.id, endsOn: null } } },
          ],
        },
        select: { id: true },
      });
      const balancesProvisioned = await provisionBalancesForAll(
        tx,
        context.organizationId,
        employees.map((employee) => employee.id),
        type,
        settings.leaveYearStartMonth,
        new Date(),
      );
      await this.audit.record(
        context,
        {
          entityType: 'LEAVE_POLICY_ASSIGNMENT',
          entityId: assignment.id,
          action: 'LEAVE_POLICY_ASSIGNED_TO_BRANCH',
          afterState: jsonSnapshot({ assignment, balancesProvisioned }),
        },
        tx,
      );
      return {
        id: assignment.id,
        branch: assignment.branch,
        leaveType: toTypeDto(assignment.leaveType),
        assignedEmployeeCount: employees.length,
        balancesProvisioned,
      };
    });
  }

  async listAssignments(context: DomainContext) {
    requirePermission(context, 'leave.types.read');
    if (!context.branchId)
      throw new ConflictError('A branch is required to list leave assignments');
    return this.database.run(context, async (tx) => {
      const assignments = await tx.leavePolicyAssignment.findMany({
        where: { organizationId: context.organizationId, branchId: context.branchId },
        include: { leaveType: true, branch: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const assignedEmployeeCount = await tx.employee.count({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          OR: [
            { primaryBranchId: context.branchId },
            { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
          ],
        },
      });
      return assignments.map((assignment) => ({
        id: assignment.id,
        branch: assignment.branch,
        leaveType: toTypeDto(assignment.leaveType),
        assignedEmployeeCount,
      }));
    });
  }
}
