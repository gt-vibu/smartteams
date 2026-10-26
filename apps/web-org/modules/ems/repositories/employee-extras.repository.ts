import { apiRequest } from '../lib/api-client';
import { orgPath } from './api-helpers';

export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';

export type FieldDefinition = {
  id: string;
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  required: boolean;
  employeeEditable: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type FieldValue = {
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  required: boolean;
  editable: boolean;
  value: string;
};

export type ProbationRow = {
  employeeId: string;
  name: string;
  employeeNumber: string;
  manager: string | null;
  dateOfJoining: string | null;
  probationEndsOn: string;
  daysLeft: number;
};

export type FieldInput = Omit<FieldDefinition, 'id' | 'key' | 'sortOrder' | 'isActive'> & {
  isActive?: boolean;
};

/** The organization's own employee fields, and probation. */
export const employeeExtrasRepository = {
  definitions: async (organizationId: string, includeInactive = false) =>
    (await apiRequest(
      orgPath(organizationId, `/custom-fields${includeInactive ? '?includeInactive=true' : ''}`),
      { method: 'GET' },
    )) as FieldDefinition[],
  createDefinition: (organizationId: string, input: FieldInput) =>
    apiRequest(orgPath(organizationId, '/custom-fields'), { method: 'POST', body: input }),
  updateDefinition: (organizationId: string, id: string, input: FieldInput) =>
    apiRequest(orgPath(organizationId, `/custom-fields/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: input,
    }),
  values: async (organizationId: string, employeeId: string) =>
    (await apiRequest(
      orgPath(organizationId, `/employees/${encodeURIComponent(employeeId)}/custom-fields`),
      { method: 'GET' },
    )) as FieldValue[],
  setValues: (organizationId: string, employeeId: string, values: Record<string, string>) =>
    apiRequest(
      orgPath(organizationId, `/employees/${encodeURIComponent(employeeId)}/custom-fields`),
      { method: 'PUT', body: { values } },
    ),
  probation: async (organizationId: string) =>
    (await apiRequest(orgPath(organizationId, '/probation'), { method: 'GET' })) as ProbationRow[],
  setProbation: (organizationId: string, employeeId: string, endsOn: string | null) =>
    apiRequest(orgPath(organizationId, `/employees/${encodeURIComponent(employeeId)}/probation`), {
      method: 'PUT',
      body: { endsOn },
    }),
  confirm: (
    organizationId: string,
    employeeId: string,
    input: { extendTo?: string; note?: string },
  ) =>
    apiRequest(
      orgPath(organizationId, `/employees/${encodeURIComponent(employeeId)}/confirmation`),
      { method: 'POST', body: input },
    ),
};
