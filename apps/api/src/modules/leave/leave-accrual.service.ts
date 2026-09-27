import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { reconcileBalance } from './leave-accrual';
import { provisionBalance } from './leave-balance-ops';
import { leavePeriod } from './leave-shared';
import { LeaveCompOffService } from './leave-comp-off.service';

/** Employees per transaction, so one large organization never holds one long write open. */
const BATCH = 200;

/**
 * The daily pass that keeps every leave balance where its policy says it should be.
 *
 * For each active employee and each leave type assigned to a branch they work in, it opens this
 * leave year's balance when there is none yet — on the first day of a new year, that is where
 * last year's carry-forward lands — and brings existing balances up to what has accrued. Every
 * step is idempotent, so a missed day is caught up by the next pass and an extra pass does nothing.
 */
@Injectable()
export class LeaveAccrualService {
  private readonly logger = new Logger(LeaveAccrualService.name);

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly compOffs: LeaveCompOffService,
  ) {}

  async accrueAll(today = new Date()) {
    const organizations = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
    );
    let added = 0;
    for (const organization of organizations) {
      try {
        added += await this.accrueOrganization(systemContext(organization.id), today);
        // Unused comp-off past its expiry lapses on the same pass.
        await this.compOffs.lapseCompOffs(systemContext(organization.id));
      } catch (caught) {
        this.logger.warn(
          `Leave accrual skipped for ${organization.id}: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }
    return { added };
  }

  async accrueOrganization(context: DomainContext, today = new Date()) {
    const { settings, assignments, employees } = await this.database.run(context, async (tx) => ({
      settings: await tx.organizationSettings.findUnique({
        where: { organizationId: context.organizationId },
        select: { leaveYearStartMonth: true },
      }),
      assignments: await tx.leavePolicyAssignment.findMany({
        where: { organizationId: context.organizationId, leaveType: { isActive: true } },
        include: { leaveType: true },
      }),
      employees: await tx.employee.findMany({
        where: { organizationId: context.organizationId, status: 'ACTIVE' },
        select: {
          id: true,
          dateOfJoining: true,
          primaryBranchId: true,
          branchAssignments: { where: { endsOn: null }, select: { branchId: true } },
        },
      }),
    }));
    if (!settings || assignments.length === 0) return 0;
    const period = leavePeriod(today, settings.leaveYearStartMonth);

    let added = 0;
    for (let start = 0; start < employees.length; start += BATCH) {
      const batch = employees.slice(start, start + BATCH);
      added += await this.database.run(context, async (tx) => {
        let batchAdded = 0;
        for (const employee of batch) {
          const branches = new Set([
            ...(employee.primaryBranchId ? [employee.primaryBranchId] : []),
            ...employee.branchAssignments.map((assignment) => assignment.branchId),
          ]);
          const types = new Map(
            assignments
              .filter((assignment) => branches.has(assignment.branchId))
              .map((assignment) => [assignment.leaveType.id, assignment.leaveType]),
          );
          for (const type of types.values()) {
            const balance = await tx.leaveBalance.findUnique({
              where: {
                employeeId_leaveTypeId_periodStart_periodEnd: {
                  employeeId: employee.id,
                  leaveTypeId: type.id,
                  ...period,
                },
              },
            });
            if (!balance) {
              await provisionBalance(
                tx,
                context,
                employee.id,
                type,
                settings.leaveYearStartMonth,
                today,
              );
              continue;
            }
            const due = await reconcileBalance(
              tx,
              context,
              balance,
              type,
              employee.dateOfJoining,
              today,
            );
            batchAdded += Number(due);
          }
        }
        return batchAdded;
      });
    }
    return added;
  }
}

function systemContext(organizationId: string): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    correlationId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set(['leave.balances.write']),
  };
}
