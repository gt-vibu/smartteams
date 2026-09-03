import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  AttendanceCorrectionDto,
  AttendanceCorrectionQueryDto,
  AttendanceDecisionDto,
  AttendancePreferencesDto,
  AttendancePreferencesQueryDto,
  AttendanceQueryDto,
  PunchDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';
import { parseWebauthnResponse, WebauthnService } from './webauthn.service';
import {
  BeginAssertionDto,
  BeginEnrollmentDto,
  CompleteAssertionDto,
  CompleteEnrollmentDto,
  RevokeCredentialDto,
} from './webauthn.dto';

@Controller('v1/organizations/:organizationId/attendance')
@UseGuards(NativeJwtGuard)
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly webauthn: WebauthnService,
    private readonly contexts: DomainContextFactory,
  ) {}

  @Get() list(
    @Param('organizationId') organizationId: string,
    @Query() query: AttendanceQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attendance.list(context, query));
  }
  /**
   * Correction requests.
   *
   * `AttendanceService.listCorrectionRequests` has existed since the module was written and is
   * reachable over the federation surface, but the native controller never exposed it — so the
   * app could raise a correction and never list one. Same for the two routes below. No service
   * or federation code changes; these are the missing HTTP entry points.
   */
  @Get('corrections') corrections(
    @Param('organizationId') organizationId: string,
    @Query() query: AttendanceCorrectionQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts.native(request.user.userId, organizationId).then((context) =>
      this.attendance.listCorrectionRequests(context, {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    );
  }

  /** Corrections awaiting the signed-in user's decision. */
  @Get('corrections/inbox') correctionInbox(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) =>
        this.attendance.listPendingCorrectionApprovals(context, request.user.userId),
      );
  }

  @Get('preferences') readPreferences(
    @Param('organizationId') organizationId: string,
    @Query() query: AttendancePreferencesQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attendance.getPreferences(context, query.branchId));
  }

  @Post('check-ins') checkIn(
    @Param('organizationId') organizationId: string,
    @Body() body: PunchDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attendance.punch(context, 'IN', { ...body, source: 'NATIVE' }));
  }
  @Post('check-outs') checkOut(
    @Param('organizationId') organizationId: string,
    @Body() body: PunchDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attendance.punch(context, 'OUT', { ...body, source: 'NATIVE' }));
  }
  @Post(':attendanceId/corrections') correction(
    @Param('organizationId') organizationId: string,
    @Param('attendanceId') attendanceId: string,
    @Body() body: AttendanceCorrectionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.attendance.requestCorrection(context, attendanceId, body));
  }
  @Post(':correctionId/decision') decision(
    @Param('organizationId') organizationId: string,
    @Param('correctionId') correctionId: string,
    @Body() body: AttendanceDecisionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.comment)
      .then((context) =>
        this.attendance.decideCorrection(context, correctionId, body.status, body.comment),
      );
  }
  @Post('preferences') preferences(
    @Param('organizationId') organizationId: string,
    @Body() body: AttendancePreferencesDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attendance.updatePreferences(context, body));
  }

  @Post('webauthn/assertions/begin') beginAssertion(
    @Param('organizationId') organizationId: string,
    @Body() body: BeginAssertionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) =>
        this.webauthn.beginAssertion(
          context,
          body.employeeId,
          body.credentialId,
          body.attendancePunchId,
        ),
      );
  }
  @Post('webauthn/assertions/complete') completeAssertion(
    @Param('organizationId') organizationId: string,
    @Body() body: CompleteAssertionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) =>
        this.webauthn.completeAssertion(
          context,
          body.challengeId,
          parseWebauthnResponse(body.response),
          body.attendancePunchId,
        ),
      );
  }
  @Post('webauthn/employees/:employeeId/enrollments/begin') beginEnrollment(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: BeginEnrollmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.webauthn.beginEnrollment(context, employeeId, body.deviceLabel));
  }
  @Post('webauthn/employees/:employeeId/enrollments/complete') completeEnrollment(
    @Param('organizationId') organizationId: string,
    @Param('employeeId') employeeId: string,
    @Body() body: CompleteEnrollmentDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) =>
        this.webauthn.completeEnrollment(
          context,
          employeeId,
          body.challengeId,
          parseWebauthnResponse(body.response),
          body.deviceLabel,
        ),
      );
  }
  @Post('webauthn/credentials/:credentialId/revoke') revokeCredential(
    @Param('organizationId') organizationId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: RevokeCredentialDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.webauthn.revoke(context, credentialId, body.reason));
  }
}
