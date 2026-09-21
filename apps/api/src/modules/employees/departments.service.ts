import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

export type DepartmentInput = {
  name?: string;
  /** Letters and digits, up to six: `TE` gives TE1, TE2 … An empty string removes the series. */
  employeeNumberPrefix?: string | null;
  headEmployeeId?: string | null;
  employeeIds?: string[];
};

/** `te` → `TE`. Refused rather than silently changed when it is not letters and digits. */
export function normalizePrefix(value: string | null | undefined): string | null {
  const prefix = (value ?? '').trim().toUpperCase();
  if (!prefix) return null;
  if (!/^[A-Z0-9]{1,6}$/.test(prefix))
    throw new ConflictError('The number series must be 1 to 6 letters or digits, such as TE');
  return prefix;
}

/**
 * The next free number in a department's series, taken atomically: the counter is advanced in the
 * same statement that reads it, so two people onboarded at once can never get the same number. A
 * number already used by hand is skipped rather than reused.
 */
export async function takeEmployeeNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  departmentId: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const department = await tx.department.update({
      where: { id: departmentId },
      data: { nextEmployeeNumber: { increment: 1 } },
      select: { employeeNumberPrefix: true, nextEmployeeNumber: true, organizationId: true },
    });
    if (department.organizationId !== organizationId) throw new NotFoundError('Department');
    if (!department.employeeNumberPrefix) return null;
    const candidate = `${department.employeeNumberPrefix}${department.nextEmployeeNumber - 1}`;
    const taken = await tx.employee.findFirst({
      where: { organizationId, employeeNumber: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new ConflictError('No free employee number was found in this series');
}

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(context: DomainContext) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const departments = await tx.department.findMany({
        where: { organizationId: context.organizationId },
        include: {
          head: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
          members: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
            orderBy: { firstName: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      });
      return departments.map((department) => ({
        id: department.id,
        name: department.name,
        employeeNumberPrefix: department.employeeNumberPrefix,
        // What the next joiner will most likely get; the real number is taken when they are saved.
        nextEmployeeNumber: department.employeeNumberPrefix
          ? `${department.employeeNumberPrefix}${department.nextEmployeeNumber}`
          : null,
        head: department.head ? person(department.head) : null,
        members: department.members.map(person),
      }));
    });
  }

  async create(context: DomainContext, input: DepartmentInput & { name: string }) {
    requirePermission(context, 'employees.write');
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new ConflictError('Give the department a name');
    const prefix = normalizePrefix(input.employeeNumberPrefix);
    return this.database.run(context, async (tx) => {
      await assertUnique(tx, context.organizationId, name, prefix);
      const department = await tx.department.create({
        data: { organizationId: context.organizationId, name, employeeNumberPrefix: prefix },
      });
      await this.applyPeople(tx, context, department.id, input);
      await this.audit.record(
        context,
        {
          entityType: 'DEPARTMENT',
          entityId: department.id,
          action: 'DEPARTMENT_CREATED',
          afterState: jsonSnapshot({ ...department, ...input }),
        },
        tx,
      );
      return { id: department.id };
    });
  }

  async update(context: DomainContext, departmentId: string, input: DepartmentInput) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const before = await tx.department.findFirst({
        where: { id: departmentId, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Department');
      const name = input.name === undefined ? undefined : input.name.trim().replace(/\s+/g, ' ');
      if (name === '') throw new ConflictError('Give the department a name');
      const prefix =
        input.employeeNumberPrefix === undefined
          ? undefined
          : normalizePrefix(input.employeeNumberPrefix);
      await assertUnique(tx, context.organizationId, name, prefix, departmentId);
      const updated = await tx.department.update({
        where: { id: departmentId },
        data: {
          ...(name ? { name } : {}),
          ...(prefix !== undefined ? { employeeNumberPrefix: prefix } : {}),
        },
      });
      await this.applyPeople(tx, context, departmentId, input);
      await this.audit.record(
        context,
        {
          entityType: 'DEPARTMENT',
          entityId: departmentId,
          action: 'DEPARTMENT_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot({ ...updated, ...input }),
        },
        tx,
      );
      return { id: departmentId };
    });
  }

  async removeMember(context: DomainContext, departmentId: string, employeeId: string) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const result = await tx.employee.updateMany({
        where: { id: employeeId, organizationId: context.organizationId, departmentId },
        data: { departmentId: null },
      });
      if (result.count === 0) throw new NotFoundError('Department member');
      // A head who leaves the department stops heading it.
      await tx.department.updateMany({
        where: { id: departmentId, headEmployeeId: employeeId },
        data: { headEmployeeId: null },
      });
      await this.audit.record(
        context,
        {
          entityType: 'DEPARTMENT',
          entityId: departmentId,
          action: 'DEPARTMENT_MEMBER_REMOVED',
          afterState: jsonSnapshot({ employeeId }),
        },
        tx,
      );
      return { id: departmentId };
    });
  }

  /** Adds members (moving them from any other department) and sets or clears the head. */
  private async applyPeople(
    tx: Prisma.TransactionClient,
    context: DomainContext,
    departmentId: string,
    input: DepartmentInput,
  ) {
    const ids = [
      ...new Set([
        ...(input.employeeIds ?? []),
        ...(input.headEmployeeId ? [input.headEmployeeId] : []),
      ]),
    ];
    if (ids.length) {
      const found = await tx.employee.count({
        where: { id: { in: ids }, organizationId: context.organizationId },
      });
      if (found !== ids.length) throw new NotFoundError('Employee');
      await tx.employee.updateMany({
        where: { id: { in: ids }, organizationId: context.organizationId },
        data: { departmentId },
      });
      // Someone moved here no longer heads the department they came from.
      await tx.department.updateMany({
        where: {
          organizationId: context.organizationId,
          id: { not: departmentId },
          headEmployeeId: { in: ids },
        },
        data: { headEmployeeId: null },
      });
    }
    if (input.headEmployeeId !== undefined)
      await tx.department.update({
        where: { id: departmentId },
        data: { headEmployeeId: input.headEmployeeId },
      });
  }
}

function person(employee: {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
}) {
  return {
    id: employee.id,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    employeeNumber: employee.employeeNumber,
  };
}

async function assertUnique(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: string | undefined,
  prefix: string | null | undefined,
  exceptId?: string,
) {
  // Two saves of the same name at once (in any case) would both pass the lookup below; the
  // database's own unique name is case-sensitive. The lock makes the second wait for the first.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`department:${organizationId}`}, 0))`;
  const clash = await tx.department.findFirst({
    where: {
      organizationId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [
        ...(name ? [{ name: { equals: name, mode: 'insensitive' as const } }] : []),
        ...(prefix ? [{ employeeNumberPrefix: prefix }] : []),
      ],
    },
    select: { name: true, employeeNumberPrefix: true },
  });
  if (!clash || (!name && !prefix)) return;
  throw new ConflictError(
    name && clash.name.toLowerCase() === name.toLowerCase()
      ? `There is already a department called ${clash.name}`
      : `The series ${prefix} is already used by ${clash.name}`,
  );
}
