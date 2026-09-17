import type { FilePurpose } from '../../generated/prisma/enums';
import type { EmployeeDocumentType } from './file.constants';

const DOCUMENT_LABELS: Record<EmployeeDocumentType, string> = {
  PROFILE_PICTURE: 'PROFILE_PICTURE',
  AADHAAR: 'AADHAAR_CARD',
  PAN: 'PAN_CARD',
  BANK_PASSBOOK_OR_CHEQUE: 'BANK_PASSBOOK_OR_CHEQUE',
  DRIVER_LICENSE: 'DRIVER_LICENSE',
  PASSPORT: 'PASSPORT',
};

const DOCUMENT_FOLDERS: Record<EmployeeDocumentType, string> = {
  PROFILE_PICTURE: 'profile',
  AADHAAR: 'documents/aadhaar',
  PAN: 'documents/pan',
  BANK_PASSBOOK_OR_CHEQUE: 'documents/bank-passbook-or-cheque',
  DRIVER_LICENSE: 'documents/driver-license',
  PASSPORT: 'documents/passport',
};

const EXTENSIONS_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function extensionFromName(originalName: string) {
  const extension = (originalName || '')
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return extension ? `.${extension}` : '';
}

export function fileExtension(originalName: string, contentType?: string) {
  return EXTENSIONS_BY_MIME[contentType?.toLowerCase() ?? ''] ?? extensionFromName(originalName);
}

export function fileDisplayName(
  purpose: FilePurpose,
  originalName: string,
  documentType?: EmployeeDocumentType,
  contentType?: string,
) {
  const label =
    documentType && DOCUMENT_LABELS[documentType]
      ? DOCUMENT_LABELS[documentType]
      : purpose === 'PAYSLIP'
        ? 'PAYSLIP'
        : purpose === 'PROFILE_IMAGE'
          ? 'PROFILE_PICTURE'
          : purpose;
  return `${label}${fileExtension(originalName, contentType)}`;
}

export function fileStorageFolder(
  organizationId: string,
  purpose: FilePurpose,
  employeeId?: string,
  documentType?: EmployeeDocumentType,
) {
  if (employeeId) {
    if (documentType && DOCUMENT_FOLDERS[documentType]) {
      return `${organizationId}/employees/${employeeId}/${DOCUMENT_FOLDERS[documentType]}`;
    }
    if (purpose === 'PAYSLIP') return `${organizationId}/employees/${employeeId}/payslips`;
    return `${organizationId}/employees/${employeeId}/${purpose.toLowerCase()}`;
  }
  return `${organizationId}/shared/${purpose.toLowerCase()}`;
}
