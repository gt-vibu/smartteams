import { apiRequest } from '../lib/api-client';
import { orgPath } from './api-helpers';

/** The columns an import understands. Every value is text, exactly as it was in the sheet. */
export type ImportRow = Partial<
  Record<
    | 'employeeNumber'
    | 'firstName'
    | 'middleName'
    | 'lastName'
    | 'workEmail'
    | 'personalEmail'
    | 'phone'
    | 'employmentType'
    | 'dateOfJoining'
    | 'aadhaarNumber'
    | 'branch'
    | 'department',
    string
  >
>;

export type ImportResult = {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  rows: Array<{
    row: number;
    ok: boolean;
    errors: string[];
    name: string;
    employeeNumber?: string;
  }>;
};

export const employeeImportRepository = {
  /** With `dryRun`, every row is checked and nothing is written. */
  async run(organizationId: string, rows: ImportRow[], dryRun: boolean): Promise<ImportResult> {
    return (await apiRequest(orgPath(organizationId, '/employee-imports'), {
      method: 'POST',
      body: { rows, dryRun },
    })) as ImportResult;
  },
};
