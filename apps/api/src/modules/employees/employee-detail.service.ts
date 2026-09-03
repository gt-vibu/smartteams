import { Injectable } from '@nestjs/common';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { assertMayReadEmployee, canReadAllEmployees, findSelfEmployeeId } from './employee-access';

/**
 * The native employee read model.
 *
 * `toEmployeeDto` is the federation response contract and must not change, so several fields the
 * native product needs are persisted and unreadable: `dateOfJoining` is accepted on create,
 * `managerEmployeeId` is set by the manager assignment route, and `jobTitle`/`department` live on
 * the current employment record. Patching each into the shared DTO would have widened an external
 * contract; this projects them into a native shape instead.
 *
 * Direct reports are derived from the `managerEmployeeId` self-relation rather than stored, so
 * there is one source of truth for the reporting line and no second hierarchy to keep in step.
 *
 * Reads are self-scoped the way the rest of the product is: `employees.read` reaches your own
 * record, and `employees.read.all` (or the tenant wildcard) reaches anyone's.
 */
@Injectable()
export class EmployeeDetailService {
  constructor(private readonly database: TenantDatabaseService) {}

  async detail(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          preferredName: true,
          workEmail: true,
          phone: true,
          status: true,
          employmentType: true,
          dateOfJoining: true,
          dateOfLeaving: true,
          primaryBranchId: true,
          managerEmployeeId: true,
          userId: true,
          version: true,
        },
      });
      if (!employee) throw new NotFoundError('Employee');
      await this.assertReadable(tx, context, employee);

      const [manager, reports, employment] = await Promise.all([
        employee.managerEmployeeId
          ? tx.employee.findFirst({
              where: {
                id: employee.managerEmployeeId,
                organizationId: context.organizationId,
              },
              select: summarySelect,
            })
          : Promise.resolve(null),
        tx.employee.findMany({
          where: {
            organizationId: context.organizationId,
            managerEmployeeId: employee.id,
            status: 'ACTIVE',
          },
          select: summarySelect,
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        }),
        // `jobTitle` and `department` live on the employment record, not the employee, so the
        // current one is the only place to read them from.
        tx.employeeEmploymentRecord.findFirst({
          where: { organizationId: context.organizationId, employeeId: employee.id },
          orderBy: [{ effectiveFrom: 'desc' }],
          select: { jobTitle: true, department: true, effectiveFrom: true },
        }),
      ]);

      return {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        middleName: employee.middleName,
        lastName: employee.lastName,
        preferredName: employee.preferredName,
        workEmail: employee.workEmail,
        phone: employee.phone,
        status: employee.status,
        employmentType: employee.employmentType,
        dateOfJoining: employee.dateOfJoining,
        dateOfLeaving: employee.dateOfLeaving,
        primaryBranchId: employee.primaryBranchId,
        jobTitle: employment?.jobTitle ?? null,
        department: employment?.department ?? null,
        /** Whether a login is attached to this employee. The user id itself is not exposed. */
        hasUserAccount: employee.userId !== null,
        managerEmployeeId: employee.managerEmployeeId,
        manager,
        directReports: reports,
        version: employee.version,
      };
    });
  }

  /**
   * The directory projection: everyone, with the fields an organization view actually needs.
   *
   * `toEmployeeDto` is the federation contract and carries neither the reporting line nor job
   * title or department. Without this, a department grouping or an org chart could only be built
   * by requesting `/detail` once per employee — an N+1 that grows with the tenant, which is why
   * the Organization workspace had no such view at all.
   *
   * Two queries regardless of size: the employees, then the current employment record for each
   * of them resolved in one grouped read.
   *
   * Self-scoped like every other employee read — an ordinary employee sees only themselves here.
   */
  async directory(context: DomainContext, filters: { limit?: number; cursor?: string } = {}) {
    requirePermission(context, 'employees.read');
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 200);
    return this.database.run(context, async (tx) => {
      const scopedToSelf = !canReadAllEmployees(context);
      const selfEmployeeId = scopedToSelf ? await findSelfEmployeeId(tx, context) : null;
      if (scopedToSelf && !selfEmployeeId) return { items: [], nextCursor: undefined };

      const employees = await tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          ...(selfEmployeeId ? { id: selfEmployeeId } : {}),
        },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          preferredName: true,
          workEmail: true,
          status: true,
          employmentType: true,
          dateOfJoining: true,
          primaryBranchId: true,
          managerEmployeeId: true,
          userId: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
        take: limit + 1,
      });

      const hasNextPage = employees.length > limit;
      const page = employees.slice(0, limit);

      // One read for the whole page, then the most recent record per employee is picked in
      // memory. Ordered ascending so the last write for an employee wins.
      const records = await tx.employeeEmploymentRecord.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId: { in: page.map((employee) => employee.id) },
        },
        orderBy: [{ effectiveFrom: 'asc' }],
        select: { employeeId: true, jobTitle: true, department: true },
      });
      const current = new Map(records.map((record) => [record.employeeId, record]));

      return {
        items: page.map((employee) => ({
          id: employee.id,
          employeeNumber: employee.employeeNumber,
          firstName: employee.firstName,
          middleName: employee.middleName,
          lastName: employee.lastName,
          preferredName: employee.preferredName,
          workEmail: employee.workEmail,
          status: employee.status,
          employmentType: employee.employmentType,
          dateOfJoining: employee.dateOfJoining
            ? employee.dateOfJoining.toISOString().slice(0, 10)
            : null,
          primaryBranchId: employee.primaryBranchId,
          managerEmployeeId: employee.managerEmployeeId,
          jobTitle: current.get(employee.id)?.jobTitle ?? null,
          department: current.get(employee.id)?.department ?? null,
          /** Whether a login is attached. The user id itself is never exposed. */
          hasUserAccount: employee.userId !== null,
        })),
        nextCursor: hasNextPage ? page.at(-1)?.id : undefined,
      };
    });
  }

  /**
   * An employee may always read their own record. Reading anyone else's needs the broader
   * permission — the same boundary Leave, Attendance, Payroll and Files use.
   *
   * The rule itself now lives in `employee-access.ts`, shared with the directory, the single
   * record, employment history and emergency contacts.
   */
  private async assertReadable(
    tx: TenantTransaction,
    context: DomainContext,
    employee: { id: string; userId: string | null },
  ) {
    await assertMayReadEmployee(tx, context, employee.id);
  }
}

const summarySelect = {
  id: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  workEmail: true,
  status: true,
} as const;
