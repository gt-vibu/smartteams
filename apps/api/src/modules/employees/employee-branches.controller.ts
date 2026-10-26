import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsDateString, IsUUID } from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { BranchAssignmentDto } from './employees.dto';
import { EmployeeBranchesService } from './employee-branches.service';

export class BranchTransferDto {
  @IsUUID() branchId!: string;
  @IsDateString() effectiveFrom!: string;
}

export class BranchEndDto {
  @IsDateString() endsOn!: string;
}

type Authed = Request & { user: NativeRequestUser };

/** An employee's branches: the primary, the additional ones, and their history. */
@Controller('v1/organizations/:organizationId/employees/:employeeId/branches')
@UseGuards(NativeJwtGuard)
export class EmployeeBranchesController {
  constructor(
    private readonly branches: EmployeeBranchesService,
    private readonly contexts: DomainContextFactory,
  ) {}

  private context(request: Authed, organizationId: string) {
    return this.contexts.native(request.user.userId, organizationId);
  }

  @Get() list(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) => this.branches.list(c, employeeId));
  }

  /**
   * Adds a branch. `isPrimary: true` is the long-standing way to set someone's primary branch and
   * is kept: it is a transfer effective from `startsOn`, and does nothing if that is already their
   * primary.
   */
  @Post() add(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: BranchAssignmentDto,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      body.isPrimary
        ? this.branches.transfer(c, employeeId, {
            branchId: body.branchId,
            effectiveFrom: body.startsOn,
          })
        : this.branches.add(c, employeeId, body),
    );
  }

  @Post('transfer') transfer(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: BranchTransferDto,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      this.branches.transfer(c, employeeId, body),
    );
  }

  @Post(':assignmentId/end') end(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: BranchEndDto,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      this.branches.end(c, employeeId, assignmentId, body),
    );
  }

  @Post(':assignmentId/cancel') cancel(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Param('assignmentId') assignmentId: string,
    @Req() request: Authed,
  ) {
    return this.context(request, organizationId).then((c) =>
      this.branches.cancel(c, employeeId, assignmentId),
    );
  }
}
