import { z } from 'zod';

/**
 * Workforce contracts — employees, teams and projects.
 *
 * These mirror the API's response shapes exactly (see `employee-mappers.ts` and
 * `teams-projects.service.ts`). They are the single definition shared by the API and both web
 * apps, so a field rename cannot silently diverge between layers.
 */

export const employeeStatusSchema = z.enum([
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'EXITED',
  'INACTIVE',
]);

export const employmentTypeSchema = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
  'CONSULTANT',
]);

export const employeeSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  employeeNumber: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  preferredName: z.string().nullable(),
  workEmail: z.string().nullable(),
  personalEmail: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  identitySource: z.string(),
  externalId: z.string().nullable(),
  status: z.string(),
  employmentType: z.string(),
  primaryBranchId: z.string().uuid().nullable(),
  version: z.number().int(),
});

/**
 * Team and project membership.
 *
 * `listTeams` / `listProjects` include their members, so current assignments are readable.
 * Note that the API exposes only member *creation* — there is no removal or end-dating route,
 * even though `leftAt` / `endsOn` exist on the models.
 */
export const teamMemberSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
  joinedAt: z.string(),
  leftAt: z.string().nullable().optional(),
});

export const projectMemberSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  employeeId: z.string().uuid(),
  projectRole: z.string().nullable().optional(),
  // Prisma serialises Decimal as a string; coerce so callers always get a number.
  allocationPercentage: z.coerce.number().nullable().optional(),
  startsOn: z.string(),
  endsOn: z.string().nullable().optional(),
});

export type TeamMember = z.infer<typeof teamMemberSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;

/**
 * Mirrors `toTeamDto` on the API. It used to mirror the Prisma row, which is why it once carried
 * `code` and `archivedAt` — neither is a column on `Team`, so neither was ever populated.
 */
export const teamSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  branchId: z.string().uuid().nullable().optional(),
  teamLeadEmployeeId: z.string().uuid().nullable().optional(),
  createdAt: z.string().optional(),
  members: z.array(teamMemberSchema).optional(),
});

/** Mirrors `toProjectDto`. `archivedAt` is gone for the same reason as on the team above. */
export const projectSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  branchId: z.string().uuid().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  members: z.array(projectMemberSchema).optional(),
});

/**
 * Employment history. `jobTitle` and `department` live here rather than on `Employee`, and the
 * earliest `effectiveFrom` is the joining date — there is no separate joined-on field exposed.
 */
export const employmentRecordSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  jobTitle: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  managerEmployeeId: z.string().uuid().nullable().optional(),
  employmentType: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
});

export type EmploymentRecord = z.infer<typeof employmentRecordSchema>;

export const branchSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  status: z.string().optional(),
});

export type Employee = z.infer<typeof employeeSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Branch = z.infer<typeof branchSchema>;

/**
 * Convenience display name, matching how the API composes it across screens.
 *
 * Structurally typed on the name fields rather than on `Employee`, so a directory row and a
 * detail projection both work without three copies of the same two lines.
 */
export function employeeDisplayName(employee: {
  preferredName?: string | null;
  firstName: string;
  lastName: string;
}): string {
  return employee.preferredName?.trim()
    ? employee.preferredName
    : `${employee.firstName} ${employee.lastName}`.trim();
}

/**
 * Parse helpers.
 *
 * Exported so the web apps can validate responses without taking a direct dependency on zod —
 * validation stays inside this package, which is the only place that should know the schemas.
 * Each returns null on a mismatch so the caller decides how to surface the failure.
 */
function parseList<T>(schema: z.ZodType<T>, payload: unknown): T[] | null {
  // A collection endpoint may answer with a bare array or a paged envelope.
  const items =
    Array.isArray(payload) || payload === null || payload === undefined
      ? payload
      : ((payload as { items?: unknown }).items ?? payload);
  const result = z.array(schema).safeParse(items);
  return result.success ? result.data : null;
}

export const parseEmployeeList = (payload: unknown) => parseList(employeeSchema, payload);
export const parseTeamList = (payload: unknown) => parseList(teamSchema, payload);
export const parseProjectList = (payload: unknown) => parseList(projectSchema, payload);
export const parseBranchList = (payload: unknown) => parseList(branchSchema, payload);

export function parseTeam(payload: unknown): Team | null {
  const result = teamSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseProject(payload: unknown): Project | null {
  const result = projectSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseEmployee(payload: unknown): Employee | null {
  const result = employeeSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export const parseEmploymentRecordList = (payload: unknown) =>
  parseList(employmentRecordSchema, payload);

/** The record in force today: the newest one whose window has not closed. */
export function currentEmploymentRecord(
  records: readonly EmploymentRecord[],
): EmploymentRecord | null {
  const open = records.filter((record) => !record.effectiveTo);
  const pool = open.length > 0 ? open : records;
  return [...pool].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

/** Joining date = the earliest employment record's effectiveFrom. */
export function joiningDateFrom(records: readonly EmploymentRecord[]): string | null {
  if (records.length === 0) return null;
  return [...records].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0]!
    .effectiveFrom;
}

/**
 * Statutory scheme enrolment (EPF, ESI, PT …).
 *
 * `registrationNumber` is the scheme's identifier for the employee — the UAN for EPF, for
 * example. PAN, tax regime and TDS rate are NOT modelled anywhere in the schema.
 */
export const statutoryProfileSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  schemeCode: z.string(),
  registrationNumber: z.string().nullable().optional(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
  // Prisma serialises Decimal as a string.
  employeeRate: z.coerce.number().nullable().optional(),
  employerRate: z.coerce.number().nullable().optional(),
});

export type StatutoryProfile = z.infer<typeof statutoryProfileSchema>;

export const parseStatutoryProfileList = (payload: unknown) =>
  parseList(statutoryProfileSchema, payload);

/** The enrolment in force for a scheme today, if any. */
export function currentStatutoryProfile(
  profiles: readonly StatutoryProfile[],
  schemeCode: string,
): StatutoryProfile | null {
  const forScheme = profiles.filter(
    (profile) => profile.schemeCode.toUpperCase() === schemeCode.toUpperCase(),
  );
  const open = forScheme.filter((profile) => !profile.effectiveTo);
  const pool = open.length > 0 ? open : forScheme;
  return [...pool].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

/**
 * The native employee read model returned by `GET /employees/:id/detail`.
 *
 * Separate from `employeeSchema` on purpose: that one mirrors the shared DTO the federation
 * contract depends on, and must not grow. This carries the fields the native product needs —
 * employment dates, job title, department, the reporting line — which are persisted but absent
 * from the shared shape.
 */
export const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  workEmail: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const employeeDetailSchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  preferredName: z.string().nullable(),
  workEmail: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.string(),
  employmentType: z.string(),
  dateOfJoining: z.string().nullable(),
  dateOfLeaving: z.string().nullable(),
  primaryBranchId: z.string().uuid().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  /** Whether a login is attached. The user id itself is never returned. */
  hasUserAccount: z.boolean(),
  managerEmployeeId: z.string().uuid().nullable(),
  manager: employeeSummarySchema.nullable(),
  directReports: z.array(employeeSummarySchema),
  version: z.number().optional(),
});

/**
 * A directory row: everything an organization-wide view needs about a person, for many people at
 * once. Distinct from `employeeDetail`, which is one person plus their reporting line, and from
 * `employee`, which is the shared federation shape and carries none of these fields.
 */
export const employeeDirectoryEntrySchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  preferredName: z.string().nullable(),
  workEmail: z.string().nullable(),
  status: z.string(),
  employmentType: z.string(),
  dateOfJoining: z.string().nullable(),
  primaryBranchId: z.string().uuid().nullable(),
  managerEmployeeId: z.string().uuid().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  hasUserAccount: z.boolean(),
});

export type EmployeeDirectoryEntry = z.infer<typeof employeeDirectoryEntrySchema>;

export const parseEmployeeDirectory = (payload: unknown) =>
  parseList(employeeDirectoryEntrySchema, payload);

export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export function parseEmployeeDetail(payload: unknown): EmployeeDetail | null {
  const result = employeeDetailSchema.safeParse(payload);
  return result.success ? result.data : null;
}
