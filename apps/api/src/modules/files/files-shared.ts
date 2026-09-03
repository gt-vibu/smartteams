import type { FilePurpose } from '../../generated/prisma/enums';

/**
 * Constants and pure rules the services in this module share.
 *
 * Extracted so no service has to depend on another merely to reach a lookup table or a
 * validator.
 */

export const limits: Record<FilePurpose, { maxBytes: number; types: string[] }> = {
  PROFILE_IMAGE: { maxBytes: 5_000_000, types: ['image/jpeg', 'image/png', 'image/webp'] },
  RESUME: {
    maxBytes: 15_000_000,
    types: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  EMPLOYEE_DOCUMENT: {
    maxBytes: 25_000_000,
    types: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  LEAVE_ATTACHMENT: { maxBytes: 15_000_000, types: ['application/pdf', 'image/jpeg', 'image/png'] },
  PAYSLIP: { maxBytes: 15_000_000, types: ['application/pdf'] },
  PAYROLL_EXPORT: {
    maxBytes: 50_000_000,
    types: [
      'text/csv',
      'application/zip',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  IMPORT: { maxBytes: 50_000_000, types: ['text/csv', 'application/json', 'application/zip'] },
  OTHER: { maxBytes: 25_000_000, types: ['application/octet-stream'] },
};

/**
 * A file as the API returns it.
 *
 * `byteSize` is a BigInt column, and Express cannot serialise one — returning the row directly
 * crashed the response with "Do not know how to serialize a BigInt" after it had already
 * committed the change. `list` converted it and the other two routes did not, so delete and
 * complete-upload were broken while listing worked.
 *
 * A decimal string, matching how every other wide number crosses this boundary; the frontend
 * contract already accepts a string here.
 */
export function toFileDto<T extends { byteSize: bigint }>(file: T) {
  return { ...file, byteSize: file.byteSize.toString() };
}
