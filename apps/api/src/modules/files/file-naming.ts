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

/** Files whose name the system sets; everything else keeps the name it was uploaded with. */
const SYSTEM_NAMED: ReadonlySet<FilePurpose> = new Set<FilePurpose>([
  'PAYSLIP',
  'PROFILE_IMAGE',
  'PAYROLL_EXPORT',
  'IMPORT',
]);

/** The uploader's own name, without path parts or control characters, and of a sane length. */
function cleanOriginalName(originalName: string) {
  const base = (originalName || '').split(/[\\/]/).pop() ?? '';
  // Control characters are exactly what is being removed, so the pattern has to name them.
  // eslint-disable-next-line no-control-regex
  const printable = base.replace(/[\u0000-\u001f\u007f]/g, '');
  return printable.trim().slice(0, 150);
}

/**
 * The name a file is listed and downloaded under.
 *
 * Identity documents, payslips and profile pictures get a standard name (`AADHAAR_CARD.pdf`), so
 * HR sees the same thing for everyone. A company policy or an offer letter keeps its own name: it
 * was being listed as `OTHER.pdf`, and a folder of those is unusable.
 */
export function fileDisplayName(
  purpose: FilePurpose,
  originalName: string,
  documentType?: EmployeeDocumentType,
  contentType?: string,
) {
  if (!(documentType && DOCUMENT_LABELS[documentType]) && !SYSTEM_NAMED.has(purpose)) {
    const own = cleanOriginalName(originalName);
    if (own) return own;
  }
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
