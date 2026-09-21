import type { FilePurpose } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { EMPLOYEE_DOCUMENT_TYPES, type EmployeeDocumentType } from './file.constants';

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
  // Company and team documents: handbooks, policies, SOPs and their forms.
  OTHER: {
    maxBytes: 25_000_000,
    types: [
      'application/octet-stream',
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
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
  // The access columns are answered by the documents routes. Left off here so the responses the
  // existing routes (and federation partners) receive keep exactly the shape they always had.
  const rest: Record<string, unknown> = { ...file };
  delete rest.accessScope;
  delete rest.teamId;
  delete rest.allowDownload;
  return {
    ...(rest as Omit<T, 'accessScope' | 'teamId' | 'allowDownload'>),
    byteSize: file.byteSize.toString(),
  };
}

export function requireFilePermission(context: DomainContext, operation: 'read' | 'write') {
  const permission = operation === 'read' ? 'files.read' : 'files.write';
  const employeeDocumentPermission =
    operation === 'read' ? 'employees.documents.read' : 'employees.documents.write';
  if (
    !context.permissions.has(permission) &&
    !context.permissions.has(employeeDocumentPermission) &&
    !context.permissions.has('*')
  ) {
    requirePermission(context, permission);
  }
}

export function documentTypeFromMetadata(metadata: unknown): EmployeeDocumentType | null {
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    'documentType' in metadata &&
    typeof metadata.documentType === 'string'
  ) {
    const documentType = metadata.documentType;
    return EMPLOYEE_DOCUMENT_TYPES.includes(documentType as EmployeeDocumentType)
      ? (documentType as EmployeeDocumentType)
      : null;
  }
  return null;
}
