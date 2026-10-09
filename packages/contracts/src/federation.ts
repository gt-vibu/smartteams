import { z } from 'zod';

export const externalIdSchema = z.string().trim().min(1).max(255);

export const federationHeadersSchema = z.object({
  authorization: z.string().startsWith('Bearer '),
  'x-correlation-id': z.string().min(1).max(128).optional(),
  'x-client-certificate-fingerprint': z.string().trim().min(1).max(255),
  'idempotency-key': z.string().min(16).max(255).optional(),
  'x-federation-action-assertion': z.string().min(1).optional(),
});

export const tenantProvisioningRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).default('ACTIVE'),
});

const onboardingText = z.string().trim().min(1);
const onboardingName = onboardingText
  .max(120)
  .regex(/^[\p{L}\p{M}\p{Join_Control} .'’-]+$/u)
  .refine((value) => /\p{L}/u.test(value));
const onboardingPhone = z.string().regex(/^\d{10,15}$/);
export const employeeOnboardingDetailsSchema = z.object({
  fatherName: onboardingName,
  motherName: onboardingName,
  spouseName: onboardingName,
  aadhaarNumber: z.string().regex(/^\d{12}$/),
  panNumber: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/),
  presentAddress: onboardingText.max(500),
  permanentAddress: onboardingText.max(500),
  bankName: onboardingText.max(160),
  bankAccountNumber: z.string().regex(/^\d{9,18}$/),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  bankAccountName: onboardingName,
  familyReferenceName: onboardingName.min(2),
  familyReferenceContact: onboardingPhone,
  referenceName2: onboardingName.min(2),
  referenceContact2: onboardingPhone,
});
export type EmployeeOnboardingDetails = z.infer<typeof employeeOnboardingDetailsSchema>;

export const employeeSyncRequestSchema = z.object({
  personalDetails: employeeOnboardingDetailsSchema.optional(),
  externalId: externalIdSchema.optional(),
  employeeNumber: z.string().trim().min(1).max(100).optional(),
  employeeNumberPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(16)
    .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
    .optional(),
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().min(1).max(100),
  preferredName: z.string().trim().max(100).optional(),
  workEmail: z.string().email().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).optional(),
  employmentType: z.string().trim().max(80).optional(),
  dateOfJoining: z.string().date().optional(),
  primaryBranchId: z.string().uuid().optional(),
  externalVersion: z.string().trim().max(255).optional(),
});

export const federationEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().positive(),
  occurredAt: z.coerce.date(),
  correlationId: z.string().min(1),
  schemaVersion: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type EmployeeSyncRequest = z.infer<typeof employeeSyncRequestSchema>;
export type FederationEventEnvelope = z.infer<typeof federationEventEnvelopeSchema>;
