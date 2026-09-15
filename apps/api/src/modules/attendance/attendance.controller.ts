import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DomainContextFactory } from '../../common/context/domain-context.factory';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  AttendanceCorrectionDto,
  MissingCheckOutCorrectionDto,
  AttendanceCorrectionQueryDto,
  AttendanceDecisionDto,
  AttendancePreferencesDto,
  AttendancePreferencesQueryDto,
  AttendanceQueryDto,
  HolidayConflictQueryDto,
  HolidayReviewDecisionDto,
  HolidayReviewRequestDto,
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

  /**
   * Check-ins on a granted optional holiday, and their review. Native only; see
   * `attendance-holiday-review.service.ts`.
   */
  @Get('holiday-conflicts') holidayConflicts(
    @Param('organizationId') organizationId: string,
    @Query() query: HolidayConflictQueryDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts.native(request.user.userId, organizationId).then((context) =>
      this.attendance.listHolidayConflicts(context, {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        from: query.from,
        to: query.to,
      }),
    );
  }
  @Get('holiday-conflicts/inbox') holidayReviewInbox(
    @Param('organizationId') organizationId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attendance.listHolidayReviewInbox(context));
  }
  @Post('holiday-conflicts/:reviewId/decision') decideHolidayReview(
    @Param('organizationId') organizationId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: HolidayReviewDecisionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attendance.decideHolidayReview(context, reviewId, body));
  }
  @Post(':attendanceId/holiday-conflict') requestHolidayReview(
    @Param('organizationId') organizationId: string,
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
    @Body() body: HolidayReviewRequestDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) => this.attendance.requestHolidayReview(context, attendanceId, body));
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
      .then((context) => this.attendance.punchNative(context, 'IN', { ...body, source: 'NATIVE' }));
  }
  @Post('check-outs') checkOut(
    @Param('organizationId') organizationId: string,
    @Body() body: PunchDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId)
      .then((context) =>
        this.attendance.punchNative(context, 'OUT', { ...body, source: 'NATIVE' }),
      );
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
  /** Native only: supply the check-out a day never had. Federation has no equivalent route. */
  @Post(':attendanceId/corrections/missing-check-out') missingCheckOut(
    @Param('organizationId') organizationId: string,
    @Param('attendanceId') attendanceId: string,
    @Body() body: MissingCheckOutCorrectionDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.contexts
      .native(request.user.userId, organizationId, undefined, body.reason)
      .then((context) => this.attendance.requestMissingCheckOut(context, attendanceId, body));
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
