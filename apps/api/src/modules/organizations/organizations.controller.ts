import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { PlatformAuthGuard } from '../platform/platform-auth.guard';
import {
  BranchDeactivationDto,
  BranchDto,
  CreateOrganizationDto,
  SourceChangeDto,
  UpdateBranchDto,
  UpdateOrganizationDto,
} from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@Controller('v1/organizations')
@UseGuards(NativeJwtGuard)
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get(':organizationId')
  async get(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.get(await this.contexts.native(request.user.userId, organizationId));
  }

  @Get(':organizationId/branches')
  async branches(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.listBranches(
      await this.contexts.native(request.user.userId, organizationId),
    );
  }

  @Post(':organizationId/branches')
  async createBranch(
    @Param('organizationId') organizationId: string,
    @Body() body: BranchDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.createBranch(
      await this.contexts.native(request.user.userId, organizationId),
      body,
    );
  }

  @Get(':organizationId/branches/:branchId')
  async getBranch(
    @Param('organizationId') organizationId: string,
    @Param('branchId') branchId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.getBranch(
      await this.contexts.native(request.user.userId, organizationId),
      branchId,
    );
  }

  @Patch(':organizationId/branches/:branchId')
  async updateBranch(
    @Param('organizationId') organizationId: string,
    @Param('branchId') branchId: string,
    @Body() body: UpdateBranchDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.updateBranch(
      await this.contexts.native(request.user.userId, organizationId),
      branchId,
      body,
    );
  }

  @Post(':organizationId/branches/:branchId/deactivate')
  async deactivateBranch(
    @Param('organizationId') organizationId: string,
    @Param('branchId') branchId: string,
    @Body() body: BranchDeactivationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.deactivateBranch(
      await this.contexts.native(request.user.userId, organizationId, undefined, body.reason),
      branchId,
      body.reason,
    );
  }

  @Patch(':organizationId')
  async update(
    @Param('organizationId') organizationId: string,
    @Body() body: UpdateOrganizationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    const context = await this.contexts.native(request.user.userId, organizationId);
    return this.organizations.update(
      context,
      Number(request.headers['if-match-version'] ?? 1),
      body,
    );
  }

  @Post()
  @UseGuards(PlatformAuthGuard)
  async create(
    @Body() body: CreateOrganizationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.createPlatform(request.user.userId, body);
  }

  @Post(':organizationId/source-change')
  @UseGuards(PlatformAuthGuard)
  async sourceChange(
    @Param('organizationId') organizationId: string,
    @Body() body: SourceChangeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.changeSource(
      this.contexts.platform(request.user.userId, body.reason, organizationId),
      body.toSource,
    );
  }

  @Post(':organizationId/deactivate')
  @UseGuards(PlatformAuthGuard)
  async deactivate(
    @Param('organizationId') organizationId: string,
    @Body() body: SourceChangeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.organizations.deactivate(
      this.contexts.platform(request.user.userId, body.reason, organizationId),
    );
  }
}
