import {
  employeeDirectorySummarySchema,
  parseEmployeeList,
  parseEmployeeDirectory,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath } from './api-helpers';

export type EmployeeReadFilters = {
  joinedFrom?: string;
  order?: 'name' | 'recent';
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  cursor?: string;
  limit?: number;
  department?: string;
  reportingManager?: string;
  hasDirectReports?: boolean;
  hasLogin?: boolean;
};

function query(filters: EmployeeReadFilters, ids?: readonly string[]) {
  const values = new URLSearchParams({ limit: String(filters.limit ?? 10) });
  const entries: Array<[string, unknown]> = Object.entries(filters);
  entries.forEach(([key, value]) => {
    if (typeof value === 'string' && value !== '') values.set(key, value);
    else if (typeof value === 'number') values.set(key, String(value));
    else if (typeof value === 'boolean') values.set(key, String(value));
  });
  ids?.forEach((id) => values.append('ids', id));
  return values;
}

function cursor(payload: unknown): string | undefined {
  const next = (payload as { nextCursor?: unknown } | null)?.nextCursor;
  return typeof next === 'string' ? next : undefined;
}

export const employeeReadRepository = {
  async summary(organizationId: string) {
    return employeeDirectorySummarySchema.parse(
      await apiRequest(`${orgPath(organizationId)}/employees/summary`, { method: 'GET' }),
    );
  },
  async page(organizationId: string, filters: EmployeeReadFilters = {}) {
    const payload = await apiRequest(`${orgPath(organizationId)}/employees?${query(filters)}`, {
      method: 'GET',
    });
    return {
      employees: expectShape(parseEmployeeList(payload), 'employee page'),
      nextCursor: cursor(payload),
    };
  },
  async directoryPage(organizationId: string, filters: EmployeeReadFilters = {}) {
    const payload = await apiRequest(
      `${orgPath(organizationId)}/employees/directory?${query(filters)}`,
      { method: 'GET' },
    );
    return {
      entries: expectShape(parseEmployeeDirectory(payload), 'directory page'),
      nextCursor: cursor(payload),
    };
  },
  async identities(organizationId: string, employeeIds: readonly string[]) {
    const ids = [...new Set(employeeIds)];
    const employees = [];
    for (let start = 0; start < ids.length; start += 200) {
      const payload = await apiRequest(
        `${orgPath(organizationId)}/employees?${query({ limit: 200 }, ids.slice(start, start + 200))}`,
        { method: 'GET' },
      );
      employees.push(...expectShape(parseEmployeeList(payload), 'employee identities'));
    }
    return employees;
  },
};
