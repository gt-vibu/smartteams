import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  AttendanceCorrectionDto,
  AttendanceDecisionDto,
  PunchDto,
} from '../attendance/attendance.dto';
import { AttendanceService } from '../attendance/attendance.service';
import { parseWebauthnResponse, WebauthnService } from '../attendance/webauthn.service';
import { ShiftsService } from '../shifts/shifts.service';
import { FederationAuthGuard } from './federation-auth.guard';
import { FederationControllerSupport } from './federation-controller-support';
import {
  FederatedAssertionBeginDto,
  FederatedAttendanceQueryDto,
  FederatedPreferencesDto,
  FederatedWebauthnCompleteDto,
} from './federation.dto';
import type { FederationRequest } from './federation.types';
import { FederationIdempotencyInterceptor } from './federation-idempotency.interceptor';
import { FederationRateLimitInterceptor } from './federation-rate-limit.interceptor';

@Controller('v1')
@UseInterceptors(FederationRateLimitInterceptor, FederationIdempotencyInterceptor)
export class FederationAttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly webauthn: WebauthnService,
    private readonly shifts: ShiftsService,
    private readonly support: FederationControllerSupport,
  ) {}

  @Get('federation/attendance')
  @UseGuards(FederationAuthGuard)
  async list(
    @Headers('x-organization-id') organizationId: string,
    @Query() query: FederatedAttendanceQueryDto,
    @Req() request: FederationRequest,
  ) {
    return this.attendance.list(
      await this.support.context(request, organizationId, 'attendance.read', query.branchId),
      query,
    );
  }

  @Get('federation/attendance/policies')
  @UseGuards(FederationAuthGuard)
  async policies(
    @Headers('x-organization-id') organizationId: string,
    @Headers('x-branch-id') branchId: string | undefined,
    @Req() request: FederationRequest,
  ) {
    return this.attendance.getPreferences(
      await this.support.context(request, organizationId, 'attendance.preferences.read', branchId),
      branchId,
    );
  }

  @Get('federation/attendance/shifts')
  @UseGuards(FederationAuthGuard)
  async shiftsList(
    @Headers('x-organization-id') organizationId: string,
    @Req() request: FederationRequest,
  ) {
    return this.shifts.list(await this.support.context(request, organizationId, 'shifts.read'));
  }

  @Put('federation/attendance/preferences')
  @UseGuards(FederationAuthGuard)
  async preferences(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedPreferencesDto,
    @Req() request: FederationRequest,
  ) {
    return this.attendance.updatePreferences(
      await this.support.context(
        request,
        organizationId,
        'attendance.preferences.write',
        body.branchId,
      ),
      body,
    );
  }

  @Post('federation/attendance/:attendanceId/corrections')
  @UseGuards(FederationAuthGuard)
  async correction(
    @Param('attendanceId') attendanceId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: AttendanceCorrectionDto,
    @Req() request: FederationRequest,
  ) {
    return this.attendance.requestCorrection(
      await this.support.context(
        request,
        organizationId,
        'attendance.corrections.write',
        undefined,
        body.reason,
      ),
      attendanceId,
      body,
    );
  }

  @Post('federation/attendance/:correctionId/decision')
  @UseGuards(FederationAuthGuard)
  async decision(
    @Param('correctionId') correctionId: string,
    @Headers('x-organization-id') organizationId: string,
    @Body() body: AttendanceDecisionDto,
    @Req() request: FederationRequest,
  ) {
    return this.attendance.decideCorrection(
      await this.support.context(
        request,
        organizationId,
        'attendance.corrections.decide',
        undefined,
        body.comment,
      ),
      correctionId,
      body.status,
      body.comment,
    );
  }

  @Post('federation/attendance/assertions/begin')
  @UseGuards(FederationAuthGuard)
  async assertionBegin(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedAssertionBeginDto,
    @Req() request: FederationRequest,
  ) {
    return this.webauthn.beginAssertion(
      await this.support.context(request, organizationId, 'attendance.webauthn.assert'),
      body.employeeId,
      body.credentialId,
      body.attendancePunchId,
    );
  }

  @Post('federation/attendance/assertions/complete')
  @UseGuards(FederationAuthGuard)
  async assertionComplete(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: FederatedWebauthnCompleteDto,
    @Req() request: FederationRequest,
  ) {
    return this.webauthn.completeAssertion(
      await this.support.context(request, organizationId, 'attendance.webauthn.assert'),
      body.challengeId,
      parseWebauthnResponse(body.response),
      body.attendancePunchId,
    );
  }

  @Post('federation/attendance/check-ins')
  @UseGuards(FederationAuthGuard)
  async checkIn(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: PunchDto,
    @Req() request: FederationRequest,
  ) {
    return this.attendance.punch(
      await this.support.context(request, organizationId, 'attendance.write', body.branchId),
      'IN',
      { ...body, source: 'FEDERATION' },
    );
  }

  @Post('federation/attendance/check-outs')
  @UseGuards(FederationAuthGuard)
  async checkOut(
    @Headers('x-organization-id') organizationId: string,
    @Body() body: PunchDto,
    @Req() request: FederationRequest,
  ) {
    return this.attendance.punch(
      await this.support.context(request, organizationId, 'attendance.write', body.branchId),
      'OUT',
      { ...body, source: 'FEDERATION' },
    );
  }
}
