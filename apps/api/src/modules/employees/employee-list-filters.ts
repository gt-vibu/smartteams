import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { employeeNameSearch } from './employee-name-search';

export type EmployeeListFilters = {
  limit?: number; cursor?: string; search?: string; status?: 'ACTIVE' | 'INACTIVE';
  ids?: string[]; department?: string; joinedFrom?: string; order?: 'name' | 'recent';
  reportingManager?: string;
  hasDirectReports?: boolean;
  hasLogin?: boolean;
};

export function employeeListWhere(context: DomainContext, filters: EmployeeListFilters): Prisma.EmployeeWhereInput {
  return {
    organizationId: context.organizationId,
    ...(filters.joinedFrom ? { dateOfJoining: { gte: new Date(`${filters.joinedFrom}T00:00:00Z`) } } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.reportingManager === 'ROOT'
      ? { managerEmployeeId: null }
      : filters.reportingManager
        ? { managerEmployeeId: filters.reportingManager }
        : {}),
    ...(filters.ids ? { id: { in: filters.ids } } : {}),
    ...(filters.hasDirectReports ? { reports: { some: { organizationId: context.organizationId, status: 'ACTIVE' } } } : {}),
    ...(filters.hasLogin === false ? { userId: null } : filters.hasLogin === true ? { userId: { not: null } } : {}),
    AND: [
      employeeNameSearch(filters.search) ?? {},
      ...(context.branchId ? [{ OR: [
        { primaryBranchId: context.branchId },
        { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
      ] }] : []),
      ...(filters.department ? [{ OR: [
        { department: { name: filters.department } },
        { departmentId: null, employmentRecords: { some: { department: filters.department, effectiveTo: null } } },
      ] }] : []),
    ],
  };
}
