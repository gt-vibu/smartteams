import { z } from 'zod';

/**
 * One of an employee's branches, as the API reports it: which branch, whether it is their
 * primary or an additional one, the dates, and where it stands today.
 */
export const branchMembershipSchema = z.object({
  id: z.string().uuid(),
  branchId: z.string().uuid(),
  branchName: z.string().nullable(),
  branchCode: z.string().nullable(),
  relationship: z.enum(['PRIMARY', 'ADDITIONAL']),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  state: z.enum(['ACTIVE', 'UPCOMING', 'ENDED']),
});

export type BranchMembership = z.infer<typeof branchMembershipSchema>;

export function parseBranchMemberships(payload: unknown): BranchMembership[] | null {
  const result = z.array(branchMembershipSchema).safeParse(payload);
  return result.success ? result.data : null;
}
