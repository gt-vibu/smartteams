import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import {
  OrganizationSource,
  OrganizationStatus,
  IdentityType,
  MembershipStatus,
  EmployeeStatus,
  EmploymentType,
  AccessMode,
  RoleScope,
  AttendanceStatus,
  AttendanceDayStatus,
  AttendancePunchType,
  AttendancePunchSource,
  TimesheetPeriodType,
  TimesheetStatus,
  TimesheetEntrySource,
  PayrollRoundingMode,
  SalarySlipMode,
  SelectionStatus,
} from '../../src/generated/prisma/enums';
import { Pool } from 'pg';
import { PERMISSIONS, EMPLOYEE_PERMISSIONS, EMPLOYEES, HOLIDAYS } from './company-data';

loadEnv({ path: resolve(__dirname, '../../../../.env') });
loadEnv({ path: resolve(__dirname, '../../../.env') });
loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

async function main() {
  console.log('--- Setting up Apex Dynamics Technologies ---');

  const databaseUrl =
    process.env.DATABASE_PLATFORM_URL ||
    process.env.DATABASE_SYSTEM_URL ||
    process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const passwordHash = await argon2.hash('Password@12345', {
    memoryCost: 19456,
    type: argon2.argon2id,
  });

  try {
    // 1. Organization & Settings
    const org = await prisma.organization.upsert({
      where: { slug: 'apex-dynamics' },
      create: {
        name: 'Apex Dynamics Technologies',
        slug: 'apex-dynamics',
        source: OrganizationSource.NATIVE,
        status: OrganizationStatus.ACTIVE,
        timezone: 'Asia/Kolkata',
        currencyCode: 'INR',
        locale: 'en-IN',
      },
      update: { status: OrganizationStatus.ACTIVE },
    });
    const orgId = org.id;

    await prisma.organizationSettings.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, optionalHolidayAllowance: 2 },
      update: { optionalHolidayAllowance: 2 },
    });

    // 2. Branch
    const branch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId: orgId, code: 'BLR-HQ' } },
      create: {
        organizationId: orgId,
        code: 'BLR-HQ',
        name: 'Bangalore Headquarters',
        source: OrganizationSource.NATIVE,
        timezone: 'Asia/Kolkata',
        address: { city: 'Bengaluru', state: 'Karnataka', country: 'IND' },
      },
      update: { source: OrganizationSource.NATIVE },
    });

    // 3. Roles & Permissions
    for (const key of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { key },
        create: { key, description: key },
        update: {},
      });
    }

    const adminRole = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: orgId, code: 'ORG_ADMIN' } },
      create: {
        organizationId: orgId,
        code: 'ORG_ADMIN',
        name: 'Organization Administrator',
        scope: RoleScope.ORGANIZATION,
        isSystem: true,
      },
      update: {},
    });
    const empRole = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: orgId, code: 'EMPLOYEE' } },
      create: {
        organizationId: orgId,
        code: 'EMPLOYEE',
        name: 'Employee',
        scope: RoleScope.ORGANIZATION,
        isSystem: true,
      },
      update: {},
    });
    const managerRole = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: orgId, code: 'MANAGER' } },
      create: {
        organizationId: orgId,
        code: 'MANAGER',
        name: 'Manager',
        scope: RoleScope.ORGANIZATION,
        isSystem: true,
      },
      update: {},
    });

    const dbPerms = await prisma.permission.findMany({ where: { key: { in: PERMISSIONS } } });
    for (const perm of dbPerms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
        create: { roleId: adminRole.id, permissionId: perm.id },
        update: {},
      });
    }

    for (const perm of dbPerms.filter((p) => EMPLOYEE_PERMISSIONS.includes(p.key))) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: empRole.id, permissionId: perm.id } },
        create: { roleId: empRole.id, permissionId: perm.id },
        update: {},
      });
    }

    // 4. Leave Types & Policies
    const leaveDefs = [
      { code: 'CASUAL', name: 'Casual Leave', paid: true, allowance: 12 },
      { code: 'SICK', name: 'Sick Leave', paid: true, allowance: 12 },
      { code: 'EARNED', name: 'Earned Leave', paid: true, allowance: 15 },
    ];
    for (const l of leaveDefs) {
      const lt = await prisma.leaveType.upsert({
        where: { organizationId_code: { organizationId: orgId, code: l.code } },
        create: {
          organizationId: orgId,
          code: l.code,
          name: l.name,
          paid: l.paid,
          accrualType: 'FIXED_ANNUAL',
          annualAllowance: l.allowance,
        },
        update: { name: l.name, paid: l.paid, annualAllowance: l.allowance },
      });
      await prisma.leavePolicyAssignment.upsert({
        where: {
          organizationId_branchId_leaveTypeId: {
            organizationId: orgId,
            branchId: branch.id,
            leaveTypeId: lt.id,
          },
        },
        create: {
          organizationId: orgId,
          branchId: branch.id,
          leaveTypeId: lt.id,
          sourceAccessMode: AccessMode.NATIVE,
        },
        update: {},
      });
    }

    // Default Approval Policies for Leave & Timesheet
    const leavePolicy = await prisma.approvalPolicy.upsert({
      where: {
        organizationId_domain_code: {
          organizationId: orgId,
          domain: 'LEAVE',
          code: 'DEFAULT_LEAVE',
        },
      },
      create: {
        organizationId: orgId,
        code: 'DEFAULT_LEAVE',
        name: 'Standard Leave Approval Policy',
        domain: 'LEAVE',
        isDefault: true,
        isActive: true,
      },
      update: { isDefault: true, isActive: true },
    });
    const existingLeaveStep = await prisma.approvalPolicyStep.findFirst({
      where: { approvalPolicyId: leavePolicy.id, stepNumber: 1 },
    });
    if (!existingLeaveStep) {
      await prisma.approvalPolicyStep.create({
        data: {
          organizationId: orgId,
          approvalPolicyId: leavePolicy.id,
          stepNumber: 1,
          approverType: 'ROLE',
          roleId: adminRole.id,
        },
      });
    }

    const timesheetPolicy = await prisma.approvalPolicy.upsert({
      where: {
        organizationId_domain_code: {
          organizationId: orgId,
          domain: 'TIMESHEET',
          code: 'DEFAULT_TIMESHEET',
        },
      },
      create: {
        organizationId: orgId,
        code: 'DEFAULT_TIMESHEET',
        name: 'Standard Timesheet Approval Policy',
        domain: 'TIMESHEET',
        isDefault: true,
        isActive: true,
      },
      update: { isDefault: true, isActive: true },
    });
    const existingTimesheetStep = await prisma.approvalPolicyStep.findFirst({
      where: { approvalPolicyId: timesheetPolicy.id, stepNumber: 1 },
    });
    if (!existingTimesheetStep) {
      await prisma.approvalPolicyStep.create({
        data: {
          organizationId: orgId,
          approvalPolicyId: timesheetPolicy.id,
          stepNumber: 1,
          approverType: 'ROLE',
          roleId: adminRole.id,
        },
      });
    }

    // 5. Payroll Policy & Rules
    const effectiveDate = new Date('2026-01-01');
    await prisma.payrollPolicy.upsert({
      where: {
        organizationId_effectiveFrom: { organizationId: orgId, effectiveFrom: effectiveDate },
      },
      create: {
        organizationId: orgId,
        effectiveFrom: effectiveDate,
        payrollDayBasis: 30,
        basePercentage: 50,
        baseMinimum: 15000,
        hraPercentage: 40,
        roundingMode: PayrollRoundingMode.HALF_UP,
        pfDefault: true,
        esiDefault: true,
        ptDefault: true,
        salarySlipDefault: true,
        payrollEnabledDefault: true,
        statutoryJurisdiction: 'KARNATAKA',
      },
      update: {},
    });

    await prisma.payrollStatutoryRule.createMany({
      data: [
        {
          organizationId: orgId,
          schemeCode: 'EPF',
          jurisdiction: 'KARNATAKA',
          effectiveFrom: effectiveDate,
          employeeRate: 12,
          employerRate: 12,
          wageCeiling: 15000,
          employeeThreshold: null,
          flatAmount: null,
        },
        {
          organizationId: orgId,
          schemeCode: 'ESIC',
          jurisdiction: 'KARNATAKA',
          effectiveFrom: effectiveDate,
          employeeRate: 0.75,
          employerRate: 3.25,
          wageCeiling: 21000,
          employeeThreshold: 21000,
          flatAmount: null,
        },
        {
          organizationId: orgId,
          schemeCode: 'PT',
          jurisdiction: 'KARNATAKA',
          effectiveFrom: effectiveDate,
          employeeRate: null,
          employerRate: null,
          wageCeiling: null,
          employeeThreshold: 25000,
          flatAmount: 200,
        },
      ],
      skipDuplicates: true,
    });

    // 6. Seed 10 Employees
    const empMap: Record<string, { id: string; userId: string }> = {};

    for (const d of EMPLOYEES) {
      const user = await prisma.user.upsert({
        where: { emailNormalized: d.email.toLowerCase() },
        create: {
          email: d.email,
          emailNormalized: d.email.toLowerCase(),
          displayName: `${d.firstName} ${d.lastName}`,
          passwordHash,
          identityType: IdentityType.NATIVE,
          isActive: true,
        },
        update: { passwordHash, isActive: true },
      });

      await prisma.userOrganization.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
        create: {
          userId: user.id,
          organizationId: orgId,
          status: MembershipStatus.ACTIVE,
          source: OrganizationSource.NATIVE,
        },
        update: { status: MembershipStatus.ACTIVE },
      });

      const role =
        d.role === 'ORG_ADMIN' ? adminRole : d.role === 'MANAGER' ? managerRole : empRole;
      const existingUserRole = await prisma.userRole.findFirst({
        where: { userId: user.id, organizationId: orgId, roleId: role.id },
      });
      if (!existingUserRole) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            organizationId: orgId,
            roleId: role.id,
            assignmentSource: AccessMode.NATIVE,
          },
        });
      }

      const emp = await prisma.employee.upsert({
        where: {
          organizationId_employeeNumber: { organizationId: orgId, employeeNumber: d.empNo },
        },
        create: {
          organizationId: orgId,
          userId: user.id,
          employeeNumber: d.empNo,
          firstName: d.firstName,
          lastName: d.lastName,
          workEmail: d.email,
          identitySource: IdentityType.NATIVE,
          status: EmployeeStatus.ACTIVE,
          employmentType: EmploymentType.FULL_TIME,
          primaryBranchId: branch.id,
          dateOfJoining: new Date('2025-01-15'),
        },
        update: {
          userId: user.id,
          workEmail: d.email,
          primaryBranchId: branch.id,
          status: EmployeeStatus.ACTIVE,
        },
      });

      empMap[d.empNo] = { id: emp.id, userId: user.id };

      const existingComp = await prisma.employeeCompensation.findFirst({
        where: { organizationId: orgId, employeeId: emp.id, effectiveFrom: effectiveDate },
      });
      if (existingComp) {
        await prisma.employeeCompensation.update({
          where: { id: existingComp.id },
          data: { baseAmount: d.gross, grossSalary: d.gross },
        });
      } else {
        await prisma.employeeCompensation.create({
          data: {
            organizationId: orgId,
            employeeId: emp.id,
            payType: 'SALARY',
            payFrequency: 'MONTHLY',
            baseAmount: d.gross,
            grossSalary: d.gross,
            currencyCode: 'INR',
            overtimeMultiplier: 1.5,
            effectiveFrom: effectiveDate,
          },
        });
      }

      await prisma.employeePayrollPolicy.upsert({
        where: {
          organizationId_employeeId_effectiveFrom: {
            organizationId: orgId,
            employeeId: emp.id,
            effectiveFrom: effectiveDate,
          },
        },
        create: {
          organizationId: orgId,
          employeeId: emp.id,
          effectiveFrom: effectiveDate,
          payrollEnabled: true,
          salarySlipMode: SalarySlipMode.ENABLED,
          pfEnabled: true,
          esiEnabled: d.gross <= 21000,
          ptEnabled: true,
          statutoryJurisdiction: 'KARNATAKA',
        },
        update: {
          payrollEnabled: true,
          pfEnabled: true,
          esiEnabled: d.gross <= 21000,
          ptEnabled: true,
        },
      });
    }

    // 7. Teams & Projects
    const coreTeam = await prisma.team.upsert({
      where: { organizationId_name: { organizationId: orgId, name: 'Core Platform Engineering' } },
      create: {
        organizationId: orgId,
        name: 'Core Platform Engineering',
        teamLeadEmployeeId: empMap['EMP-003']?.id,
        status: 'ACTIVE',
      },
      update: {},
    });
    const prodTeam = await prisma.team.upsert({
      where: { organizationId_name: { organizationId: orgId, name: 'Product & Design' } },
      create: {
        organizationId: orgId,
        name: 'Product & Design',
        teamLeadEmployeeId: empMap['EMP-006']?.id,
        status: 'ACTIVE',
      },
      update: {},
    });

    for (const empNo of ['EMP-001', 'EMP-002', 'EMP-003', 'EMP-005', 'EMP-009']) {
      const e = empMap[empNo];
      if (
        e &&
        !(await prisma.teamMember.findFirst({
          where: { organizationId: orgId, teamId: coreTeam.id, employeeId: e.id },
        }))
      ) {
        await prisma.teamMember.create({
          data: {
            organizationId: orgId,
            teamId: coreTeam.id,
            employeeId: e.id,
            joinedAt: new Date('2025-02-01'),
          },
        });
      }
    }
    for (const empNo of ['EMP-006', 'EMP-007', 'EMP-008', 'EMP-010']) {
      const e = empMap[empNo];
      if (
        e &&
        !(await prisma.teamMember.findFirst({
          where: { organizationId: orgId, teamId: prodTeam.id, employeeId: e.id },
        }))
      ) {
        await prisma.teamMember.create({
          data: {
            organizationId: orgId,
            teamId: prodTeam.id,
            employeeId: e.id,
            joinedAt: new Date('2025-02-01'),
          },
        });
      }
    }

    const apollo = await prisma.project.upsert({
      where: { organizationId_code: { organizationId: orgId, code: 'PRJ-APOLLO' } },
      create: {
        organizationId: orgId,
        code: 'PRJ-APOLLO',
        name: 'Project Apollo (Enterprise Suite)',
        status: 'ACTIVE',
      },
      update: {},
    });
    for (const empNo of [
      'EMP-001',
      'EMP-002',
      'EMP-003',
      'EMP-005',
      'EMP-006',
      'EMP-007',
      'EMP-008',
    ]) {
      const e = empMap[empNo];
      if (
        e &&
        !(await prisma.projectMember.findFirst({
          where: { organizationId: orgId, projectId: apollo.id, employeeId: e.id },
        }))
      ) {
        await prisma.projectMember.create({
          data: {
            organizationId: orgId,
            projectId: apollo.id,
            employeeId: e.id,
            startsOn: new Date('2025-02-01'),
            allocationPercentage: 100,
          },
        });
      }
    }

    // 8. Holidays (Mandatory & Optional)
    for (const h of HOLIDAYS) {
      const hDate = new Date(h.date);
      const createdH = await prisma.holiday.upsert({
        where: {
          organizationId_branchId_holidayDate: {
            organizationId: orgId,
            branchId: branch.id,
            holidayDate: hDate,
          },
        },
        create: {
          organizationId: orgId,
          branchId: branch.id,
          holidayDate: hDate,
          name: h.name,
          isOptional: h.isOptional,
          isActive: true,
          sourceAccessMode: AccessMode.NATIVE,
        },
        update: { name: h.name, isOptional: h.isOptional },
      });

      if (h.isOptional) {
        for (const empNo of ['EMP-001', 'EMP-002', 'EMP-003']) {
          const e = empMap[empNo];
          if (e) {
            await prisma.employeeHolidaySelection.upsert({
              where: { employeeId_holidayId: { employeeId: e.id, holidayId: createdH.id } },
              create: {
                organizationId: orgId,
                employeeId: e.id,
                holidayId: createdH.id,
                year: 2026,
                status: SelectionStatus.CONFIRMED,
              },
              update: { status: SelectionStatus.CONFIRMED },
            });
          }
        }
      }
    }

    // 9. Attendance Check-ins (Today: 2026-09-08)
    const today = new Date('2026-09-08');
    const punchTime = new Date('2026-09-08T09:00:00.000+05:30');

    for (const empNo of Object.keys(empMap)) {
      const { id: empId, userId } = empMap[empNo]!;
      const att = await prisma.attendanceRecord.upsert({
        where: { employeeId_workDate: { employeeId: empId, workDate: today } },
        create: {
          organizationId: orgId,
          employeeId: empId,
          branchId: branch.id,
          workDate: today,
          status: AttendanceStatus.OPEN,
          dayStatus: AttendanceDayStatus.PRESENT,
          scheduledMinutes: 480,
          workedMinutes: 240,
          sourceAccessMode: AccessMode.NATIVE,
        },
        update: { status: AttendanceStatus.OPEN, dayStatus: AttendanceDayStatus.PRESENT },
      });

      await prisma.attendancePunch.create({
        data: {
          organizationId: orgId,
          attendanceRecordId: att.id,
          employeeId: empId,
          punchType: AttendancePunchType.IN,
          occurredAt: punchTime,
          source: AttendancePunchSource.NATIVE,
          capturedByUserId: userId,
        },
      });
    }
    console.log('Checked-in all 10 employees.');

    // 10. Timesheet Period & Timesheets
    const periodStart = new Date('2026-09-01');
    const periodEnd = new Date('2026-09-30');
    const timesheetPeriod = await prisma.timesheetPeriod.upsert({
      where: {
        organizationId_periodStart_periodEnd: { organizationId: orgId, periodStart, periodEnd },
      },
      create: {
        organizationId: orgId,
        periodType: TimesheetPeriodType.MONTHLY,
        periodStart,
        periodEnd,
        status: TimesheetStatus.DRAFT,
      },
      update: {},
    });

    const workDates = [
      new Date('2026-09-01'),
      new Date('2026-09-02'),
      new Date('2026-09-03'),
      new Date('2026-09-04'),
      new Date('2026-09-07'),
      new Date('2026-09-08'),
    ];

    for (const empNo of Object.keys(empMap)) {
      const { id: empId } = empMap[empNo]!;
      const timesheet = await prisma.timesheet.upsert({
        where: {
          employeeId_timesheetPeriodId: {
            employeeId: empId,
            timesheetPeriodId: timesheetPeriod.id,
          },
        },
        create: {
          organizationId: orgId,
          timesheetPeriodId: timesheetPeriod.id,
          employeeId: empId,
          branchId: branch.id,
          status: TimesheetStatus.SUBMITTED,
          totalMinutes: workDates.length * 480,
          regularMinutes: workDates.length * 480,
          overtimeMinutes: 0,
          sourceAccessMode: AccessMode.NATIVE,
          submittedAt: new Date(),
        },
        update: {
          status: TimesheetStatus.SUBMITTED,
          totalMinutes: workDates.length * 480,
          regularMinutes: workDates.length * 480,
        },
      });

      for (const wDate of workDates) {
        await prisma.timesheetEntry.create({
          data: {
            organizationId: orgId,
            timesheetId: timesheet.id,
            workDate: wDate,
            minutes: 480,
            regularMinutes: 480,
            overtimeMinutes: 0,
            source: TimesheetEntrySource.MANUAL,
            description: 'Core sprint deliverables and development tasks',
          },
        });
      }
    }
    console.log('Timesheets logged for all 10 employees.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
