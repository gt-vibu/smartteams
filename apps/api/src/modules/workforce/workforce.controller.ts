import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { WorkforceFilterDto, WorkforcePreviewDto, WorkforceStartDto } from './workforce.dto';
import { WorkforcePlanService } from './workforce-plan.service';
import { WorkforceJobsService } from './workforce-jobs.service';
import { WorkforceCatalogService } from './workforce-catalog.service';

class OptionsDto {
  @IsEnum(['PAYROLL_POLICY', 'SHIFT', 'MANAGER', 'LEAVE_POLICY', 'SALARY'])
  operation!: WorkforcePreviewDto['operation'];
}
class PeopleDto extends WorkforceFilterDto {
  @IsOptional() @IsUUID() cursor?: string;
}
class ResultsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) offset?: number;
}
type Authed = Request & { user: NativeRequestUser };
@Controller('v1/organizations/:organizationId/workforce')
@UseGuards(NativeJwtGuard)
export class WorkforceController {
  constructor(
    private readonly contexts: DomainContextFactory,
    private readonly plans: WorkforcePlanService,
    private readonly jobs: WorkforceJobsService,
    private readonly catalog: WorkforceCatalogService,
  ) {}
  @Get('options') options(
    @Param('organizationId') org: string,
    @Req() req: Authed,
    @Query() query: OptionsDto,
  ) {
    return this.contexts
      .native(req.user.userId, org)
      .then((context) => this.catalog.options(context, query.operation));
  }
  @Get('people') people(
    @Param('organizationId') org: string,
    @Req() req: Authed,
    @Query() query: PeopleDto,
  ) {
    return this.contexts
      .native(req.user.userId, org)
      .then((context) => this.catalog.people(context, query, query.cursor));
  }
  @Post('preview') preview(
    @Param('organizationId') org: string,
    @Req() req: Authed,
    @Body() body: WorkforcePreviewDto,
  ) {
    return this.contexts.native(req.user.userId, org).then(async (context) => {
      const { rows, ...plan } = await this.plans.plan(context, body);
      return { ...plan, rows: rows.slice(0, 100) };
    });
  }
  @Post('jobs') start(
    @Param('organizationId') org: string,
    @Req() req: Authed,
    @Body() body: WorkforceStartDto,
  ) {
    return this.contexts
      .native(req.user.userId, org)
      .then((context) => this.jobs.start(context, body));
  }
  @Get('jobs/:batchId') status(
    @Param('organizationId') org: string,
    @Param('batchId', ParseUUIDPipe) id: string,
    @Req() req: Authed,
    @Query() query: ResultsDto,
  ) {
    return this.contexts
      .native(req.user.userId, org)
      .then((context) => this.jobs.status(context, id, query.offset));
  }
  @Get('jobs/:batchId/retry-preview') retryPreview(
    @Param('organizationId') org: string,
    @Param('batchId', ParseUUIDPipe) id: string,
    @Req() req: Authed,
  ) {
    return this.contexts
      .native(req.user.userId, org)
      .then((context) => this.jobs.retryPreview(context, id));
  }
  @Get('jobs/:batchId/results.csv') async csv(
    @Param('organizationId') org: string,
    @Param('batchId', ParseUUIDPipe) id: string,
    @Req() req: Authed,
    @Res({ passthrough: true }) res: Response,
  ) {
    const context = await this.contexts.native(req.user.userId, org);
    const job = await this.jobs.find(context, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assignments-${id}.csv"`);
    const cell = (value: string) =>
      `"${(/^(?:\s*[=+\-@]|[\t\r])/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
    return [
      'Employee or branch,ID,Outcome,Details',
      ...job.data.results.map((row) =>
        [row.name, row.id, row.outcome, row.message].map(cell).join(','),
      ),
    ].join('\r\n');
  }
}
