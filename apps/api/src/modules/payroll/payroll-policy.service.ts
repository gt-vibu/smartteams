import { Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';

import { PayrollAdvancesService } from './payroll-advances.service';
import { PayrollPolicySettingsService } from './payroll-policy-settings.service';
import { PayrollSalaryProfileService } from './payroll-salary-profile.service';
import { PayrollStatutoryService } from './payroll-statutory.service';

/**
 * The payroll policy module's entry point.
 *
 * Was 794 lines covering four separate things: the effective-dated policy, salary profiles,
 * statutory reference data and advances. Split along those lines, with the one shared write path
 * moved to `payroll-policy-shared` so no service depends on another.
 *
 * The constructor still takes `(database, audit)`, so Nest and any direct construction are
 * unaffected and every method forwards unchanged.
 */
@Injectable()
export class PayrollPolicyService {
  private readonly advances: PayrollAdvancesService;
  private readonly salary: PayrollSalaryProfileService;
  private readonly settings: PayrollPolicySettingsService;
  private readonly statutory: PayrollStatutoryService;

  constructor(database: TenantDatabaseService, audit: AuditService) {
    this.advances = new PayrollAdvancesService(database);
    this.salary = new PayrollSalaryProfileService(database, audit);
    this.settings = new PayrollPolicySettingsService(database, audit);
    this.statutory = new PayrollStatutoryService(database, audit);
  }

  // --- policy ------------------------------------------------------------------------------

  getPolicy(...args: Parameters<PayrollPolicySettingsService['getPolicy']>) {
    return this.settings.getPolicy(...args);
  }

  savePolicy(...args: Parameters<PayrollPolicySettingsService['savePolicy']>) {
    return this.settings.savePolicy(...args);
  }

  saveEmployeePolicy(...args: Parameters<PayrollPolicySettingsService['saveEmployeePolicy']>) {
    return this.settings.saveEmployeePolicy(...args);
  }

  // --- salary profiles ---------------------------------------------------------------------

  saveSalaryProfile(...args: Parameters<PayrollSalaryProfileService['saveSalaryProfile']>) {
    return this.salary.saveSalaryProfile(...args);
  }

  getSalaryProfile(...args: Parameters<PayrollSalaryProfileService['getSalaryProfile']>) {
    return this.salary.getSalaryProfile(...args);
  }

  // --- statutory rules ---------------------------------------------------------------------

  listStatutoryRules(...args: Parameters<PayrollStatutoryService['listStatutoryRules']>) {
    return this.statutory.listStatutoryRules(...args);
  }

  saveStatutoryRule(...args: Parameters<PayrollStatutoryService['saveStatutoryRule']>) {
    return this.statutory.saveStatutoryRule(...args);
  }

  deleteStatutoryRule(...args: Parameters<PayrollStatutoryService['deleteStatutoryRule']>) {
    return this.statutory.deleteStatutoryRule(...args);
  }

  // --- advances and payments ------------------------------------------------------------------

  listAdvances(...args: Parameters<PayrollAdvancesService['listAdvances']>) {
    return this.advances.listAdvances(...args);
  }

  requestAdvance(...args: Parameters<PayrollAdvancesService['requestAdvance']>) {
    return this.advances.requestAdvance(...args);
  }

  decideAdvance(...args: Parameters<PayrollAdvancesService['decideAdvance']>) {
    return this.advances.decideAdvance(...args);
  }

  listPayments(...args: Parameters<PayrollAdvancesService['listPayments']>) {
    return this.advances.listPayments(...args);
  }

  markPaymentPaid(...args: Parameters<PayrollAdvancesService['markPaymentPaid']>) {
    return this.advances.markPaymentPaid(...args);
  }
}
