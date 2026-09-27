import {
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { markPayrollStale } from './payroll-staleness';
import { readAdvanceRules } from './payroll-advance-rules';
import { PayrollPolicyService } from './payroll-policy.service';

export class AdvanceRulesDto {
  /** 0 turns salary advances off. */
  @IsInt() @Min(0) @Max(100) limitPercent!: number;
  @IsInt() @Min(1) @Max(24) recoveryMonths!: number;
}

export class AdvanceAllowanceQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
}

/** The organization's salary-advance rules: how much may be asked for, and how it is repaid. */
@Injectable()
export class PayrollAdvanceRulesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** Readable by anyone who can see advances, so the request form can state the limit. */
  get(context: DomainContext) {
    requirePermission(context, 'payroll.advances.read');
    return this.database.run(context, (tx) => readAdvanceRules(tx, context.organizationId));
  }

  save(context: DomainContext, input: AdvanceRulesDto) {
    requirePermission(context, 'payroll.policy.write');
    return this.database.run(context, async (tx) => {
      const before = await readAdvanceRules(tx, context.organizationId);
      const data = {
        advanceLimitPercent: input.limitPercent,
        advanceRecoveryMonths: input.recoveryMonths,
      };
      await tx.organizationSettings.upsert({
        where: { organizationId: context.organizationId },
        create: { organizationId: context.organizationId, ...data },
        update: data,
      });
      const after = { limitPercent: input.limitPercent, recoveryMonths: input.recoveryMonths };
      // A run already calculated took back advances at the old pace.
      if (before.recoveryMonths !== after.recoveryMonths)
        await markPayrollStale(tx, context.organizationId, new Date(0));
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_POLICY',
          entityId: context.organizationId,
          action: 'ADVANCE_RULES_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(after),
        },
        tx,
      );
      return after;
    });
  }
}

type Authed = Request & { user: NativeRequestUser };

@Controller('v1/organizations/:organizationId/payroll')
@UseGuards(NativeJwtGuard)
export class PayrollAdvanceRulesController {
  constructor(
    private readonly rules: PayrollAdvanceRulesService,
    private readonly payroll: PayrollPolicyService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get('advance-rules') get(
    @Param('organizationId') organizationId: string,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.rules.get(context));
  }

  @Put('advance-rules') save(
    @Param('organizationId') organizationId: string,
    @Body() body: AdvanceRulesDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.rules.save(context, body));
  }

  /** How much more someone may ask for: the caller, or anyone for those who see all advances. */
  @Get('advances/allowance') allowance(
    @Param('organizationId') organizationId: string,
    @Query() query: AdvanceAllowanceQueryDto,
    @Req() request: Authed,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.payroll.advanceAllowance(context, query.employeeId));
  }
}
