import type { DomainContext } from '../../common/context/domain-context';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { canReadAllEmployees, findSelfEmployeeId } from './employee-access';
import { employeeListWhere } from './employee-list-filters';

export async function employeeDirectorySummary(tx: TenantTransaction, context: DomainContext) {
  const self = canReadAllEmployees(context) ? undefined : await findSelfEmployeeId(tx, context);
  const where = {
    AND: [employeeListWhere(context, {}), ...(self !== undefined ? [{ id: self ?? '00000000-0000-0000-0000-000000000000' }] : [])],
  };
  const [active, former, managers, withoutManager, withoutLogin, titles, departments] = await Promise.all([
    tx.employee.count({ where: { ...where, status: 'ACTIVE' } }),
    tx.employee.count({ where: { ...where, status: 'INACTIVE' } }),
    tx.employee.count({ where: { ...where, status: 'ACTIVE', reports: { some: { organizationId: context.organizationId, status: 'ACTIVE' } } } }),
    tx.employee.count({ where: { ...where, status: 'ACTIVE', managerEmployeeId: null } }),
    tx.employee.count({ where: { ...where, status: 'ACTIVE', userId: null } }),
    tx.employeeEmploymentRecord.findMany({ where: { organizationId: context.organizationId, employee: where, jobTitle: { not: null } }, distinct: ['jobTitle'], select: { jobTitle: true } }),
    tx.department.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return { active, former, managers, withoutManager, withoutLogin, departments, jobTitles: titles.map((entry) => entry.jobTitle!).sort() };
}
