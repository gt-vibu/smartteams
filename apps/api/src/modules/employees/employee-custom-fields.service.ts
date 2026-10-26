import { dateProblem } from '@smarteam/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';
export type FieldInput = {
  label: string;
  fieldType: FieldType;
  options?: string[];
  required?: boolean;
  employeeEditable?: boolean;
  sortOrder?: number;
  isActive?: boolean;
};

const has = (context: DomainContext, permission: string) =>
  context.permissions.has('*') || context.permissions.has(permission);

/** "Blood group" → "blood_group": stable, readable, and safe as a JSON key. */
const keyOf = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

/**
 * The organization's own employee fields: a blood group, a T-shirt size, a vehicle number.
 *
 * HR defines them once; they then appear on every profile. A field marked as the employee's own is
 * shown to and edited by the person themselves; the rest only by those who manage employees. A
 * field that is switched off keeps what was recorded in it but is no longer shown or asked for.
 */
@Injectable()
export class EmployeeCustomFieldsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  definitions(context: DomainContext, includeInactive = false) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, (tx) =>
      tx.customFieldDefinition.findMany({
        where: {
          organizationId: context.organizationId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  createDefinition(context: DomainContext, input: FieldInput) {
    requirePermission(context, 'employees.write');
    const label = input.label.trim();
    const key = keyOf(label);
    if (!key) throw new ConflictError('Give the field a name.');
    const options = cleanOptions(input);
    return this.database.run(context, async (tx) => {
      const clash = await tx.customFieldDefinition.findFirst({
        where: { organizationId: context.organizationId, key },
        select: { label: true },
      });
      if (clash) throw new ConflictError(`There is already a field called ${clash.label}.`);
      const created = await tx.customFieldDefinition.create({
        data: {
          organizationId: context.organizationId,
          key,
          label,
          fieldType: input.fieldType,
          options,
          required: input.required ?? false,
          employeeEditable: input.employeeEditable ?? false,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await this.record(context, tx, created.id, 'CUSTOM_FIELD_CREATED', null, created);
      return created;
    });
  }

  updateDefinition(context: DomainContext, id: string, input: FieldInput) {
    requirePermission(context, 'employees.write');
    const options = cleanOptions(input);
    return this.database.run(context, async (tx) => {
      const before = await tx.customFieldDefinition.findFirst({
        where: { id, organizationId: context.organizationId },
      });
      if (!before) throw new NotFoundError('Field');
      // The key stays: every value already recorded is stored under it.
      const updated = await tx.customFieldDefinition.update({
        where: { id: before.id },
        data: {
          label: input.label.trim() || before.label,
          fieldType: input.fieldType,
          options,
          required: input.required ?? before.required,
          employeeEditable: input.employeeEditable ?? before.employeeEditable,
          sortOrder: input.sortOrder ?? before.sortOrder,
          isActive: input.isActive ?? before.isActive,
        },
      });
      await this.record(context, tx, updated.id, 'CUSTOM_FIELD_UPDATED', before, updated);
      return updated;
    });
  }

  /** One employee's values, limited to the fields the caller may see. */
  values(context: DomainContext, employeeId: string) {
    return this.database.run(context, async (tx) => {
      const { employee, manages } = await this.access(tx, context, employeeId);
      const fields = await tx.customFieldDefinition.findMany({
        where: {
          organizationId: context.organizationId,
          isActive: true,
          ...(manages ? {} : { employeeEditable: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      });
      const stored = (employee.customFields ?? {}) as Record<string, unknown>;
      return fields.map((field) => ({
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        options: field.options,
        required: field.required,
        editable: manages || field.employeeEditable,
        value:
          typeof stored[field.key] === 'string' || typeof stored[field.key] === 'number'
            ? String(stored[field.key])
            : '',
      }));
    });
  }

  setValues(context: DomainContext, employeeId: string, values: Record<string, string>) {
    return this.database.run(context, async (tx) => {
      const { employee, manages } = await this.access(tx, context, employeeId);
      const fields = await tx.customFieldDefinition.findMany({
        where: { organizationId: context.organizationId, isActive: true },
      });
      const next = { ...((employee.customFields ?? {}) as Record<string, unknown>) };
      const problems: string[] = [];
      for (const field of fields) {
        if (!(field.key in values)) {
          if (field.required && manages && !next[field.key])
            problems.push(`${field.label} is required.`);
          continue;
        }
        if (!manages && !field.employeeEditable)
          throw new ForbiddenDomainError(`${field.label} is kept by HR.`);
        const raw = (values[field.key] ?? '').trim();
        if (!raw) {
          if (field.required) problems.push(`${field.label} is required.`);
          else delete next[field.key];
          continue;
        }
        const problem = invalid(field, raw);
        if (problem) problems.push(problem);
        else next[field.key] = field.fieldType === 'NUMBER' ? Number(raw) : raw;
      }
      const unknown = Object.keys(values).filter(
        (key) => !fields.some((field) => field.key === key),
      );
      if (unknown.length) problems.push(`Unknown field: ${unknown.join(', ')}.`);
      if (problems.length) throw new ConflictError(problems.join(' '));
      await tx.employee.update({
        where: { id: employee.id },
        data: { customFields: next as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          action: 'EMPLOYEE_CUSTOM_FIELDS_UPDATED',
          beforeState: jsonSnapshot(employee.customFields),
          afterState: jsonSnapshot(next),
        },
        tx,
      );
      return { saved: true };
    });
  }

  private async access(tx: Prisma.TransactionClient, context: DomainContext, employeeId: string) {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, organizationId: context.organizationId },
      select: { id: true, userId: true, customFields: true },
    });
    if (!employee) throw new NotFoundError('Employee');
    const manages = has(context, 'employees.write');
    const self = Boolean(employee.userId) && employee.userId === context.actor.userId;
    if (!manages && !self && !has(context, 'employees.read.all'))
      throw new NotFoundError('Employee');
    return { employee, manages };
  }

  private record(
    context: DomainContext,
    tx: Prisma.TransactionClient,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record(
      context,
      {
        entityType: 'CUSTOM_FIELD',
        entityId: id,
        action,
        ...(before ? { beforeState: jsonSnapshot(before) } : {}),
        afterState: jsonSnapshot(after),
      },
      tx,
    );
  }
}

function cleanOptions(input: FieldInput) {
  const options = [
    ...new Set((input.options ?? []).map((option) => option.trim()).filter(Boolean)),
  ];
  if (input.fieldType === 'SELECT' && options.length < 2)
    throw new ConflictError('A choice field needs at least two options.');
  return input.fieldType === 'SELECT' ? options : [];
}

function invalid(field: { label: string; fieldType: string; options: string[] }, raw: string) {
  // Plain numerals only: JavaScript also reads "1e5", "0x1F" and "  12" as numbers.
  if (field.fieldType === 'NUMBER' && !/^-?\d{1,15}(\.\d{1,4})?$/.test(raw))
    return `${field.label} must be a number, written with digits only.`;
  if (field.fieldType === 'DATE') {
    const problem = dateProblem(raw, field.label, { earliest: '1900-01-01', latest: '2100-12-31' });
    if (problem) return problem;
  }
  if (field.fieldType === 'SELECT' && !field.options.includes(raw))
    return `${field.label} must be one of: ${field.options.join(', ')}.`;
  if (raw.length > 500) return `${field.label} is too long.`;
  return null;
}
