import { z } from 'zod';

const departmentPersonSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  employeeNumber: z.string(),
});

/** A department the organization defines, with its number series, head and members. */
export const departmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** `TE` gives new joiners TE1, TE2 … */
  employeeNumberPrefix: z.string().nullable(),
  /** The number the next joiner will most likely get; null without a series. */
  nextEmployeeNumber: z.string().nullable(),
  head: departmentPersonSchema.nullable(),
  members: z.array(departmentPersonSchema),
  /** Tenant-scoped total; `members` is a bounded preview for large organizations. */
  memberCount: z.number().int().nonnegative().optional(),
});

export type Department = z.infer<typeof departmentSchema>;
export type DepartmentPerson = z.infer<typeof departmentPersonSchema>;

export function parseDepartments(payload: unknown): Department[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    const parsed = departmentSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
