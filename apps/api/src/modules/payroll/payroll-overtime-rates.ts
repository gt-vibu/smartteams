import { Body, Controller, Get, Injectable, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import type { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { markPayrollStale } from './payroll-staleness';

/**
 * What overtime pays, as multiples of the hourly rate. `standard` is the default for a new
 * salary (each employee's own multiplier on their salary is what is paid); `weeklyOff` and
 * `holiday` are paid for overtime on those days. Null means the same as the employee's own rate,
 * so nothing is paid differently until the company sets one.
 */
export type OvertimeRates = { standard: number; weeklyOff: number | null; holiday: number | null };

export const DEFAULT_OVERTIME_RATES: OvertimeRates = {
  standard: 1.5,
  weeklyOff: null,
  holiday: null,
};

type Metadata = Prisma.JsonObject;

export function readOvertimeRates(metadata: unknown): OvertimeRates {
  const data = (metadata && typeof metadata === 'object' ? metadata : {}) as Metadata;
  const stored = (data.overtimeRates ?? {}) as Record<string, unknown>;
  const rate = (value: unknown) => (typeof value === 'number' && value > 0 ? value : null);
  return {
    standard: rate(stored.standard) ?? DEFAULT_OVERTIME_RATES.standard,
    weeklyOff: rate(stored.weeklyOff),
    holiday: rate(stored.holiday),
  };
}

export async function loadOvertimeRates(tx: TenantTransaction, organizationId: string) {
  const settings = await tx.organizationSettings.findUnique({
    where: { organizationId },
    select: { metadata: true },
  });
  return readOvertimeRates(settings?.metadata);
}

export class OvertimeRatesDto {
  @IsNumber() @Min(1) @Max(5) standard!: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(1) @Max(5) weeklyOff?:
    number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(1) @Max(5) holiday?:
    number | null;
}

@Injectable()
export class PayrollOvertimeRatesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  get(context: DomainContext) {
    requirePermission(context, 'payroll.policy.read');
    return this.database.run(context, (tx) => loadOvertimeRates(tx, context.organizationId));
  }

  save(context: DomainContext, input: OvertimeRatesDto) {
    requirePermission(context, 'payroll.policy.write');
    return this.database.run(context, async (tx) => {
      await tx.organizationSettings.upsert({
        where: { organizationId: context.organizationId },
        create: { organizationId: context.organizationId, metadata: {} },
        update: {},
      });
      await tx.$queryRaw`SELECT organization_id FROM organization_settings WHERE organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const settings = await tx.organizationSettings.findUniqueOrThrow({
        where: { organizationId: context.organizationId },
        select: { metadata: true },
      });
      const before = readOvertimeRates(settings.metadata);
      const after: OvertimeRates = {
        standard: input.standard,
        weeklyOff: input.weeklyOff ?? null,
        holiday: input.holiday ?? null,
      };
      await tx.organizationSettings.update({
        where: { organizationId: context.organizationId },
        data: {
          metadata: {
            ...((settings.metadata ?? {}) as Metadata),
            overtimeRates: after,
          },
        },
      });
      // Calculated runs priced overtime at the old rates.
      await markPayrollStale(tx, context.organizationId, new Date(0));
      await this.audit.record(
        context,
        {
          entityType: 'PAYROLL_POLICY',
          entityId: context.organizationId,
          action: 'OVERTIME_RATES_UPDATED',
          beforeState: jsonSnapshot(before),
          afterState: jsonSnapshot(after),
        },
        tx,
      );
      return after;
    });
  }
}

@Controller('v1/organizations/:organizationId/payroll/overtime-rates')
@UseGuards(NativeJwtGuard)
export class PayrollOvertimeRatesController {
  constructor(
    private readonly rates: PayrollOvertimeRatesService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get() get(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.rates.get(context));
  }

  @Put() save(
    @Param('organizationId') organizationId: string,
    @Body() body: OvertimeRatesDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.rates.save(context, body));
  }
}
