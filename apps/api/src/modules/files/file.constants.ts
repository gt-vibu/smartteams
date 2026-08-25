export const EMPLOYEE_DOCUMENT_TYPES = [
  'PROFILE_PICTURE',
  'AADHAAR',
  'PAN',
  'DRIVER_LICENSE',
  'PASSPORT',
] as const;

export type EmployeeDocumentType = (typeof EMPLOYEE_DOCUMENT_TYPES)[number];
