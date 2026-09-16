import { Injectable } from '@nestjs/common';
import { EmployeeStatus } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { toEmployeeDto } from './employee-mappers';
import { assertMayReadEmployee } from './employee-access';

import { assertEmployee } from './employee-records-shared';

/**
 * Emergency contacts, and the two links that attach an employee to a person: their login and
 * their manager.
 *
 * Small, flat records — no effective dating, which is what separates them from employment
 * history.
 */
@Injectable()
export class EmployeeContactsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listEmergencyContacts(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      await assertEmployee(tx, context.organizationId, employeeId);
      // Next-of-kin names and phone numbers. Self-scoped on the same boundary as the record
      // they hang off.
      await assertMayReadEmployee(tx, context, employeeId);
      return tx.employeeEmergencyContact.findMany({
        where: { organizationId: context.organizationId, employeeId },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      });
    });
  }

  /**
   * Employment history for an employee, most recent first.
   *
   * `jobTitle` and `department` live on this record rather than on `Employee`, so this is the
   * only way to read them. Deliberately a separate route instead of widening `toEmployeeDto`,
   * which is part of the federation response contract and must not change.
   */

  async addEmergencyContact(
    context: DomainContext,
    employeeId: string,
    input: {
      name: string;
      relationship: string;
      phone: string;
      email?: string;
      isPrimary?: boolean;
      sortOrder?: number;
    },
  ) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      await assertEmployee(tx, context.organizationId, employeeId);
      if (input.isPrimary)
        await tx.employeeEmergencyContact.updateMany({
          where: { organizationId: context.organizationId, employeeId, isPrimary: true },
          data: { isPrimary: false },
        });
      const contact = await tx.employeeEmergencyContact.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          name: input.name.trim(),
          relationship: input.relationship.trim(),
          phone: input.phone.trim(),
          email: input.email?.trim(),
          isPrimary: input.isPrimary ?? false,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_EMERGENCY_CONTACT',
          entityId: contact.id,
          action: 'EMPLOYEE_EMERGENCY_CONTACT_CREATED',
          afterState: jsonSnapshot(contact),
        },
        tx,
      );
      return contact;
    });
  }

  async linkUser(context: DomainContext, employeeId: string, userId: string) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const employee = await assertEmployee(tx, context.organizationId, employeeId);
      if (employee.userId === userId) return toEmployeeDto(employee);
      if (employee.userId)
        throw new ConflictError('This employee is already linked to a different user account');

      // Membership is the tenant boundary: a user outside this organization must not become one
      // of its employees by id alone.
      const membership = await tx.userOrganization.findFirst({
        where: { userId, organizationId: context.organizationId, status: 'ACTIVE' },
        select: { userId: true },
      });
      if (!membership) throw new NotFoundError('Active organization member');

      const taken = await tx.employee.findFirst({
        where: { userId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (taken) throw new ConflictError('That user account is already linked to another employee');

      const updated = await tx.employee.update({
        where: { id: employee.id },
        data: { userId, version: { increment: 1 } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          action: 'EMPLOYEE_USER_LINKED',
          beforeState: jsonSnapshot(employee),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return toEmployeeDto(updated);
    });
  }

  async assignManager(context: DomainContext, employeeId: string, managerEmployeeId: string) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const employee = await assertEmployee(tx, context.organizationId, employeeId);
      if (
        employeeId === managerEmployeeId ||
        !(await tx.employee.findFirst({
          where: {
            id: managerEmployeeId,
            organizationId: context.organizationId,
            status: EmployeeStatus.ACTIVE,
          },
        }))
      )
        throw new ConflictError('Manager must be another active employee in this organization');
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: { managerEmployeeId, version: { increment: 1 } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employeeId,
          action: 'EMPLOYEE_MANAGER_ASSIGNED',
          beforeState: jsonSnapshot(employee),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return toEmployeeDto(updated);
    });
  }
}
