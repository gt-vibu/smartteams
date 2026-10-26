import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { DepartmentsService } from './departments.service';

class DepartmentFieldsDto {
  @IsOptional() @IsString() @MaxLength(12) employeeNumberPrefix?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() headEmployeeId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true }) employeeIds?: string[];
}

export class CreateDepartmentDto extends DepartmentFieldsDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}

export class UpdateDepartmentDto extends DepartmentFieldsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
}

type AuthedRequest = Request & { user: NativeRequestUser };

/** The organization's departments. Native only; federation partners do not see these routes. */
@Controller('v1/organizations/:organizationId/departments')
@UseGuards(NativeJwtGuard)
export class DepartmentsController {
  constructor(
    private readonly contexts: DomainContextFactory,
    private readonly departments: DepartmentsService,
  ) {}

  @Get() list(@Param('organizationId') organizationId: string, @Req() request: AuthedRequest) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.departments.list(context));
  }

  @Post() create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateDepartmentDto,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.departments.create(context, body));
  }

  @Patch(':departmentId') update(
    @Param('organizationId') organizationId: string,
    @Param('departmentId', ParseUUIDPipe) departmentId: string,
    @Body() body: UpdateDepartmentDto,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.departments.update(context, departmentId, body));
  }

  @Post(':departmentId/members/:employeeId/remove') removeMember(
    @Param('organizationId') organizationId: string,
    @Param('departmentId', ParseUUIDPipe) departmentId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Req() request: AuthedRequest,
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.departments.removeMember(context, departmentId, employeeId));
  }
}
