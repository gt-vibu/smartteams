import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ArrayMaxSize,
} from 'class-validator';
import { IsWholeNumber } from '../../common/validation/field-rules';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { EmployeeCustomFieldsService, type FieldType } from './employee-custom-fields.service';
import { EmployeeMilestonesService } from './employee-milestones.service';

export class CustomFieldDto {
  @IsString() @MinLength(1) @MaxLength(60) label!: string;
  @IsIn(['TEXT', 'NUMBER', 'DATE', 'SELECT']) fieldType!: FieldType;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'A choice field can have at most 50 options.' })
  @IsString({ each: true })
  @MaxLength(60, { each: true, message: 'Each option can be at most 60 characters.' })
  options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() employeeEditable?: boolean;
  @IsOptional() @IsWholeNumber('Order', 0, 1000) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CustomFieldValuesDto {
  @IsObject() values!: Record<string, string>;
}

export class ProbationDto {
  /** Null takes them off probation. */
  @ValidateIf((_, value) => value !== null) @IsDateString() endsOn!: string | null;
}

export class ConfirmationDto {
  @IsOptional() @IsDateString() extendTo?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

type Authed = Request & { user: NativeRequestUser };

/** The organization's own employee fields, probation and confirmation. */
@Controller('v1/organizations/:organizationId')
@UseGuards(NativeJwtGuard)
export class EmployeeExtrasController {
  constructor(
    private readonly fields: EmployeeCustomFieldsService,
    private readonly milestones: EmployeeMilestonesService,
    private readonly contexts: DomainContextFactory,
  ) {}

  private context(request: Authed, organizationId: string) {
    return this.contexts.native(request.user.userId, organizationId);
  }

  @Get('custom-fields') definitions(
    @Param('organizationId') org: string,
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.fields.definitions(context, includeInactive === 'true'),
    );
  }

  @Post('custom-fields') createDefinition(
    @Param('organizationId') org: string,
    @Body() body: CustomFieldDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.fields.createDefinition(context, body),
    );
  }

  @Patch('custom-fields/:fieldId') updateDefinition(
    @Param('organizationId') org: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() body: CustomFieldDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.fields.updateDefinition(context, fieldId, body),
    );
  }

  @Get('employees/:employeeId/custom-fields') values(
    @Param('organizationId') org: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) => this.fields.values(context, employeeId));
  }

  @Put('employees/:employeeId/custom-fields') setValues(
    @Param('organizationId') org: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() body: CustomFieldValuesDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.fields.setValues(context, employeeId, body.values),
    );
  }

  @Get('probation') probation(@Param('organizationId') org: string, @Req() request: Authed) {
    return this.context(request, org).then((context) => this.milestones.probationList(context));
  }

  @Put('employees/:employeeId/probation') setProbation(
    @Param('organizationId') org: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() body: ProbationDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.milestones.setProbation(context, employeeId, body.endsOn),
    );
  }

  @Post('employees/:employeeId/confirmation') confirm(
    @Param('organizationId') org: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() body: ConfirmationDto,
    @Req() request: Authed,
  ) {
    return this.context(request, org).then((context) =>
      this.milestones.confirm(context, employeeId, body),
    );
  }
}
