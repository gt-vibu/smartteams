export const FEDERATION_CAPABILITY_CATALOG = [
  {
    code: 'employees',
    version: 'v1',
    description: 'Federated employee identity and access synchronization.',
  },
  {
    code: 'attendance',
    version: 'v1',
    description: 'Federated attendance records, corrections, and preferences.',
  },
  {
    code: 'leave',
    version: 'v1',
    description: 'Federated leave types, balances, requests, and approvals.',
  },
  {
    code: 'payroll',
    version: 'v1',
    description: 'Federated payroll runs, adjustments, and ledger visibility.',
  },
  {
    code: 'shifts',
    version: 'v1',
    description: 'Federated shift definitions and attendance scheduling.',
  },
  {
    code: 'device_verification',
    version: 'v1',
    description: 'Federated WebAuthn device verification for workforce actions.',
  },
] as const;
