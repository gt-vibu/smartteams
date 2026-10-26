import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { requirePermission } from '../../common/context/domain-context';
import { NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { payrollReadiness } from './payroll-readiness';

@Controller('v1/organizations/:organizationId/payroll/runs')
@UseGuards(NativeJwtGuard)
export class PayrollReadinessController {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly contexts: DomainContextFactory,
  ) {}
  @Get(':id/readiness') async readiness(
    @Param('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    const context = await this.contexts.native(request.user.userId, organizationId);
    requirePermission(context, 'payroll.runs.read');
    requirePermission(context, 'payroll.payslips.read.all');
    return this.database.run(
      context,
      async (tx) => {
        const run = await tx.payrollRun.findFirst({ where: { id, organizationId } });
        if (!run) throw new NotFoundError('Payroll run');
        return payrollReadiness(tx, organizationId, run);
      },
      { timeout: 30000 },
    );
  }
}
