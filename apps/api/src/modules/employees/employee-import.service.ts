import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmploymentType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { EmployeesService } from './employees.service';
import { primaryBranchOf } from '../organizations/organization-primary-branch';
import { normalizeEmail, normalizeEmployeeNumber } from './employee-identity-rules';
import {
  fingerprintEmployeeSecret,
  isValidAadhaar,
  normalizeAadhaar,
} from './employee-sensitive-data';

export type ImportRow = {
  employeeNumber?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  employmentType?: string;
  dateOfJoining?: string;
  aadhaarNumber?: string;
  branch?: string;
  department?: string;
};

export type ImportOutcome = {
  /** 1-based, as the person sees it in their spreadsheet (header excluded). */
  row: number;
  ok: boolean;
  errors: string[];
  employeeId?: string;
  employeeNumber?: string;
  name: string;
};

const MAX_ROWS = 1000;

/** The words people actually write in a spreadsheet, besides the values themselves. */
const EMPLOYMENT_SYNONYMS: Record<string, EmploymentType> = {
  permanent: EmploymentType.FULL_TIME,
  fulltime: EmploymentType.FULL_TIME,
  contract: EmploymentType.CONTRACTOR,
  contractual: EmploymentType.CONTRACTOR,
  consultant: EmploymentType.CONTRACTOR,
  temp: EmploymentType.TEMPORARY,
  internship: EmploymentType.INTERN,
  trainee: EmploymentType.INTERN,
};

const EMPLOYMENT_TYPES: Record<string, EmploymentType> = Object.fromEntries(
  Object.values(EmploymentType).flatMap((value) => {
    const words = value.toLowerCase().replace(/_/g, ' ');
    return [
      [value.toLowerCase(), value],
      [words, value],
      [words.replace(/ /g, '-'), value],
      [words.replace(/ /g, ''), value],
    ];
  }),
);

/** YYYY-MM-DD, or DD/MM/YYYY and DD-MM-YYYY as spreadsheets in India write them. */
function parseDate(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const [y, m, d] = iso
    ? [iso[1], iso[2], iso[3]]
    : dmy
      ? [dmy[3], dmy[2], dmy[1]]
      : [null, null, null];
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Hiring many people from one spreadsheet.
 *
 * `check` reads every row against the same rules a single hire meets — names, employment type,
 * dates, Aadhaar, and the numbers, emails and Aadhaar already taken, in the organization or earlier
 * in the same file — and names every problem per row, without writing anything. `commit` then
 * hires the rows that pass through the ordinary hiring path, one transaction each, so a row that
 * fails at the last moment is reported and the others still go in.
 */
@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly config: ConfigService,
    private readonly employees: EmployeesService,
  ) {}

  async check(context: DomainContext, rows: ImportRow[]) {
    requirePermission(context, 'employees.write');
    if (rows.length === 0) throw new ConflictError('The file has no employee rows.');
    if (rows.length > MAX_ROWS)
      throw new ConflictError(`Import up to ${MAX_ROWS} employees at a time.`);
    return this.database.run(context, async (tx) => {
      const organizationId = context.organizationId;
      // A row with no branch joins the main one: with none at all, nobody could apply for leave.
      const primary = await primaryBranchOf(tx, organizationId);
      const [branches, departments, employees, profiles] = await Promise.all([
        tx.branch.findMany({
          where: { organizationId },
          select: { id: true, name: true, code: true, status: true },
        }),
        tx.department.findMany({ where: { organizationId }, select: { id: true, name: true } }),
        tx.employee.findMany({
          where: { organizationId },
          select: { employeeNumber: true, workEmail: true },
        }),
        tx.employeePersonalProfile.findMany({
          where: { organizationId, aadhaarNumberHash: { not: null } },
          select: { aadhaarNumberHash: true },
        }),
      ]);
      const branchBy = new Map(
        branches.flatMap((b) => [
          [b.name.toLowerCase(), b],
          [b.code.toLowerCase(), b],
        ]),
      );
      const departmentBy = new Map(departments.map((d) => [d.name.toLowerCase(), d]));
      const takenNumbers = new Set(employees.map((e) => e.employeeNumber.toLowerCase()));
      const takenEmails = new Set(employees.flatMap((e) => (e.workEmail ? [e.workEmail] : [])));
      const takenAadhaar = new Set(profiles.map((p) => p.aadhaarNumberHash));
      const seenNumbers = new Map<string, number>();
      const seenEmails = new Map<string, number>();
      const seenAadhaar = new Map<string, number>();

      return rows.map((raw, index) => {
        const row = index + 1;
        const errors: string[] = [];
        const firstName = raw.firstName?.trim() ?? '';
        const lastName = raw.lastName?.trim() ?? '';
        if (!firstName) errors.push('First name is missing.');
        if (!lastName) errors.push('Last name is missing.');

        const typed = (raw.employmentType ?? 'full time').trim().toLowerCase();
        const type = EMPLOYMENT_TYPES[typed] ?? EMPLOYMENT_SYNONYMS[typed];
        if (!type) errors.push(`"${raw.employmentType}" is not an employment type.`);

        const joined = raw.dateOfJoining?.trim() ? parseDate(raw.dateOfJoining) : null;
        if (raw.dateOfJoining?.trim() && !joined)
          errors.push(`"${raw.dateOfJoining}" is not a date (use YYYY-MM-DD or DD/MM/YYYY).`);

        const number = raw.employeeNumber?.trim()
          ? normalizeEmployeeNumber(raw.employeeNumber)
          : '';
        if (number) {
          const key = number.toLowerCase();
          if (takenNumbers.has(key)) errors.push(`Employee ID ${number} is already in use.`);
          else if (seenNumbers.has(key))
            errors.push(`Employee ID ${number} is also on row ${seenNumbers.get(key)}.`);
          else seenNumbers.set(key, row);
        }

        const email = normalizeEmail(raw.workEmail);
        if (email) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            errors.push(`${email} is not a valid email address.`);
          else if (takenEmails.has(email)) errors.push(`${email} already belongs to an employee.`);
          else if (seenEmails.has(email))
            errors.push(`${email} is also on row ${seenEmails.get(email)}.`);
          else seenEmails.set(email, row);
        }

        const aadhaar = normalizeAadhaar(raw.aadhaarNumber ?? '');
        if (!aadhaar) errors.push('Aadhaar number is missing.');
        else if (!isValidAadhaar(aadhaar)) errors.push('Aadhaar number is not valid.');
        else {
          const hash = fingerprintEmployeeSecret(this.config, aadhaar);
          if (takenAadhaar.has(hash)) errors.push('This Aadhaar number is already recorded.');
          else if (seenAadhaar.has(hash))
            errors.push(`The same Aadhaar number is also on row ${seenAadhaar.get(hash)}.`);
          else seenAadhaar.set(hash, row);
        }

        let branchId: string | undefined = primary?.id;
        if (raw.branch?.trim()) {
          branchId = undefined;
          const branch = branchBy.get(raw.branch.trim().toLowerCase());
          if (!branch) errors.push(`There is no branch called "${raw.branch}".`);
          else if (branch.status !== 'ACTIVE') errors.push(`${branch.name} is deactivated.`);
          else branchId = branch.id;
        }
        let departmentId: string | undefined;
        if (raw.department?.trim()) {
          const department = departmentBy.get(raw.department.trim().toLowerCase());
          if (!department) errors.push(`There is no department called "${raw.department}".`);
          else departmentId = department.id;
        }

        return {
          row,
          errors,
          name: `${firstName} ${lastName}`.trim() || `Row ${row}`,
          input: {
            ...(number ? { employeeNumber: number } : {}),
            firstName,
            lastName,
            ...(raw.middleName?.trim() ? { middleName: raw.middleName.trim() } : {}),
            ...(email ? { workEmail: email } : {}),
            ...(raw.personalEmail?.trim() ? { personalEmail: raw.personalEmail.trim() } : {}),
            ...(raw.phone?.trim() ? { phone: raw.phone.trim() } : {}),
            employmentType: type ?? EmploymentType.FULL_TIME,
            ...(joined ? { dateOfJoining: joined } : {}),
            ...(branchId ? { primaryBranchId: branchId } : {}),
            ...(departmentId ? { departmentId } : {}),
            aadhaarNumber: aadhaar,
          },
        };
      });
    });
  }

  async run(context: DomainContext, rows: ImportRow[], dryRun: boolean) {
    const checked = await this.check(context, rows);
    const outcomes: ImportOutcome[] = [];
    for (const item of checked) {
      if (item.errors.length > 0 || dryRun) {
        outcomes.push({
          row: item.row,
          ok: item.errors.length === 0,
          errors: item.errors,
          name: item.name,
        });
        continue;
      }
      try {
        const created = (await this.employees.createNative(context, item.input)) as {
          id: string;
          employeeNumber: string;
        };
        outcomes.push({
          row: item.row,
          ok: true,
          errors: [],
          name: item.name,
          employeeId: created.id,
          employeeNumber: created.employeeNumber,
        });
      } catch (caught) {
        outcomes.push({
          row: item.row,
          ok: false,
          errors: [caught instanceof Error ? caught.message : 'This row could not be imported.'],
          name: item.name,
        });
      }
    }
    return {
      dryRun,
      total: outcomes.length,
      valid: outcomes.filter((outcome) => outcome.ok).length,
      invalid: outcomes.filter((outcome) => !outcome.ok).length,
      rows: outcomes,
    };
  }
}
