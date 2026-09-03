import { z } from 'zod';

/**
 * Organization and branch shapes, matching what `OrganizationsService` returns.
 *
 * The organization DTO is deliberately small, and it is the whole of what the backend models: a
 * name, a timezone, a currency, a locale, and identity/status fields the tenant cannot change.
 * There is no department, announcement, milestone or org-chart entity anywhere in the schema —
 * screens for those are not backed and must say so rather than invent one.
 *
 * Branch shapes live in `workforce.ts`, which already publishes them; they are not restated here.
 */

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  source: z.string(),
  externalId: z.string().nullable().optional(),
  status: z.string(),
  timezone: z.string(),
  currencyCode: z.string(),
  locale: z.string(),
  version: z.number().optional(),
});

export type Organization = z.infer<typeof organizationSchema>;

export function parseOrganization(payload: unknown): Organization | null {
  const result = organizationSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** The only organization fields a tenant administrator may change. */
export const EDITABLE_ORGANIZATION_FIELDS = ['name', 'timezone', 'currencyCode'] as const;
