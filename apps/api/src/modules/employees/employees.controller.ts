import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  AccessCodeIssueDto,
  CreateEmployeeDto,
  EmployeeDeactivationDto,
  EmployeeReferenceDto,
  ManagerAssignmentDto,
  EmployeeListQueryDto,
  UserLinkDto,
  UpdateEmployeeDto,
} from './employees.dto';
import {
  NativeCompensationDto,
  NativeEmergencyContactDto,
  NativeEmployeeBankAccountDto,
  NativeEmployeePersonalProfileDto,
  NativeEmployeeReferencesDto,
  NativeEmploymentRecordDto,
} from './employees-native.dto';
import { ConflictError } from '../../common/errors/domain-error';
import { EmployeesService } from './employees.service';
import { EmployeeDetailService } from './employee-detail.service';
import { EmployeeRecordsService } from './employee-records.service';
import { EmployeeAccessCodeService } from './employee-access-code.service';

@Controller('v1/organizations/:organizationId/employees')
@UseGuards(NativeJwtGuard)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly employeeDetail: EmployeeDetailService,
    private readonly accessCodes: EmployeeAccessCodeService,
    private readonly records: EmployeeRecordsService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Query() query: EmployeeListQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.list(context, query));
  }
  /**
   * The native employee read model: employment dates, job title, department, the reporting line
   * and direct reports. Separate from `GET :employeeId` because that returns the shared DTO the
   * federation contract depends on, which must not be widened.
   */
  /**
   * The directory projection. Declared before `:employeeId` so the literal path is not captured
   * as an employee id.
   */
  @Get('directory') directory(
    @Param('organizationId') organizationId: string,
    @Query() query: EmployeeListQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employeeDetail.directory(context, query));
  }

  @Get(':employeeId/detail') detail(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employeeDetail.detail(context, employeeId));
  }
  @Get(':employeeId') get(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.get(context, employeeId));
  }
  @Post() create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateEmployeeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.createNative(context, body));
  }
  @Patch(':employeeId') update(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: UpdateEmployeeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    const version = Number(request.headers['if-match-version'] ?? 1);
    if (!Number.isSafeInteger(version) || version < 1)
      throw new ConflictError('if-match-version must be a positive integer');
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.updateNative(context, employeeId, version, body));
  }
  @Post(':employeeId/deactivate') deactivate(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: EmployeeDeactivationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.employees.deactivate(context, employeeId, body.reason));
  }
  @Get(':employeeId/emergency-contacts') contacts(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.listEmergencyContacts(context, employeeId));
  }
  @Post(':employeeId/emergency-contacts') addContact(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: NativeEmergencyContactDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.addEmergencyContact(context, employeeId, body));
  }
  @Get(':employeeId/personal-profile') personalProfile(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.records.getPersonalProfile(context, employeeId));
  }

  @Put(':employeeId/personal-profile') updatePersonalProfile(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: NativeEmployeePersonalProfileDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts.native(request.user.userId, organizationId).then((context) =>
      this.records.upsertPersonalProfile(context, employeeId, body, {
        enforceIdentityRules: true,
      }),
    );
  }

  @Get(':employeeId/bank-accounts') bankAccounts(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.records.listBankAccounts(context, employeeId));
  }

  @Post(':employeeId/bank-accounts') addBankAccount(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: NativeEmployeeBankAccountDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.records.addBankAccount(context, employeeId, body));
  }

  @Put(':employeeId/bank-accounts/primary') replacePrimaryBankAccount(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: NativeEmployeeBankAccountDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.records.replacePrimaryBankAccount(context, employeeId, body));
  }

  @Get(':employeeId/references') references(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.records.listReferences(context, employeeId));
  }

  @Post(':employeeId/references') addReference(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: EmployeeReferenceDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.records.addReference(context, employeeId, body));
  }

  @Put(':employeeId/references') replaceReferences(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: NativeEmployeeReferencesDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.records.replaceReferences(context, employeeId, body.references));
  }

  @Get(':employeeId/employment-records') employmentRecords(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.listEmploymentRecords(context, employeeId));
  }
  @Post(':employeeId/employment-records') employment(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: NativeEmploymentRecordDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.addEmploymentRecord(context, employeeId, body));
  }
  @Post(':employeeId/compensation') compensation(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: NativeCompensationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.addCompensation(context, employeeId, body));
  }
  @Post(':employeeId/user') linkUser(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: UserLinkDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.linkUser(context, employeeId, body.userId));
  }
  /**
   * Whether this employee can sign in yet, and if not, how far along giving them access is.
   *
   * An employee record and a login are separate things here, so this gap is a state to show
   * rather than an error to hide.
   */
  @Get(':employeeId/access-code') accessCodeStatus(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.accessCodes.status(context, employeeId));
  }

  /**
   * Issues a one-time code the employee uses to activate their own login.
   *
   * The plaintext code is in this response and nowhere else, so a caller that loses it has to
   * issue a new one — which withdraws the old.
   */
  @Post(':employeeId/access-code') issueAccessCode(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: AccessCodeIssueDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.accessCodes.issue(context, employeeId, body.roleIds ?? []));
  }

  /** Withdraws an outstanding code, for one shared with the wrong person. */
  @Delete(':employeeId/access-code') revokeAccessCode(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.accessCodes.revoke(context, employeeId));
  }

  @Put(':employeeId/manager') manager(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: ManagerAssignmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.employees.assignManager(context, employeeId, body.managerEmployeeId));
  }
}
