import { apiDownload } from '../lib/api-client';
import { orgPath, queryString } from './api-helpers';

export type ScopedReportFilters = {
  from: string;
  to: string;
  status?: string;
  employeeId?: string;
  departmentId?: string;
  search?: string;
};

export const reportExportRepository = {
  leave(organizationId: string, filters: ScopedReportFilters) {
    return apiDownload(`${orgPath(organizationId, '/reports/leave/export')}${queryString(filters)}`, `leave-${filters.from}-to-${filters.to}.csv`);
  },
  timesheets(organizationId: string, filters: ScopedReportFilters) {
    return apiDownload(`${orgPath(organizationId, '/reports/timesheets/export')}${queryString(filters)}`, `timesheets-${filters.from}-to-${filters.to}.csv`);
  },
};
