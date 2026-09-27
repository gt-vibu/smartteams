import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { EmployeeImportService } from './employee-import.service';

/** One spreadsheet row, as typed. Every field is text; the service reads and checks it. */
class ImportRowDto {
  @IsOptional() @IsString() @MaxLength(40) employeeNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) middleName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(200) workEmail?: string;
  @IsOptional() @IsString() @MaxLength(200) personalEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) employmentType?: string;
  @IsOptional() @IsString() @MaxLength(20) dateOfJoining?: string;
  @IsOptional() @IsString() @MaxLength(20) aadhaarNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) branch?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
}

class EmployeeImportDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
  /** Check every row and report, writing nothing. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

@Controller('v1/organizations/:organizationId/employee-imports')
@UseGuards(NativeJwtGuard)
export class EmployeeImportController {
  constructor(
    private readonly contexts: DomainContextFactory,
    private readonly imports: EmployeeImportService,
  ) {}

  @Post() import(
    @Param('organizationId') organizationId: string,
    @Body() body: EmployeeImportDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.imports.run(context, body.rows, body.dryRun ?? false));
  }
}
