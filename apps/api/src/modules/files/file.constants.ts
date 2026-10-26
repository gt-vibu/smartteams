export const EMPLOYEE_DOCUMENT_TYPES = [
  'PROFILE_PICTURE',
  'AADHAAR',
  'PAN',
  'BANK_PASSBOOK_OR_CHEQUE',
  'DRIVER_LICENSE',
  'PASSPORT',
] as const;

export type EmployeeDocumentType = (typeof EMPLOYEE_DOCUMENT_TYPES)[number];
