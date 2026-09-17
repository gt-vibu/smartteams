import { Body, Controller, Post, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { LoginResponse } from '@smarteam/contracts';
import { AuthCookieService } from './auth.cookies';
import { PasswordChangeService } from './auth.password-change.service';
import { PasswordInvitationService } from './auth.password-invitation.service';
import { PasswordResetCodeService } from './auth.password-reset-code.service';
import {
  PasswordChangeDto,
  PasswordCodeRequestDto,
  PasswordCodeResetDto,
  PasswordSetupDto,
  PasswordSetupPreviewDto,
} from './auth-password.dto';
import { AuthRateLimitInterceptor } from './auth-rate-limit.interceptor';
import { NativeJwtGuard, type NativeRequestUser } from './jwt.guard';

type AuthedRequest = Request & { user: NativeRequestUser };

/**
 * Choosing, resetting and changing a password.
 *
 * Everything unauthenticated here is behind the same per-address rate limiter as sign-in. No
 * response contains a password, and no password or link token is ever read from a URL.
 */
@Controller('v1/auth/password')
@UseInterceptors(AuthRateLimitInterceptor)
export class AuthPasswordController {
  constructor(
    private readonly invitations: PasswordInvitationService,
    private readonly resetCodes: PasswordResetCodeService,
    private readonly changes: PasswordChangeService,
    private readonly cookies: AuthCookieService,
  ) {}

  /** Whose invitation link this is, before they choose a password. */
  @Post('setup/preview')
  previewSetup(@Body() body: PasswordSetupPreviewDto) {
    return this.invitations.preview(body.token);
  }

  /** Spends the invitation link on the person's own password. */
  @Post('setup')
  completeSetup(@Body() body: PasswordSetupDto) {
    return this.invitations.complete(body.token, body.password);
  }

  /** Emails a reset code. Answers the same whether or not the address has an account. */
  @Post('forgot')
  requestCode(@Body() body: PasswordCodeRequestDto) {
    return this.resetCodes.request(body.email);
  }

  @Post('reset')
  resetWithCode(@Body() body: PasswordCodeResetDto) {
    return this.resetCodes.confirm(body.email, body.code, body.password);
  }

  /** Changes the signed-in user's password and keeps them signed in on a fresh session. */
  @Post('change')
  @UseGuards(NativeJwtGuard)
  async change(
    @Body() body: PasswordChangeDto,
    @Req() request: AuthedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const session = await this.changes.change(
      {
        userId: request.user.userId,
        ...(request.user.organizationId ? { organizationId: request.user.organizationId } : {}),
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      },
      { ipAddress: request.ip, userAgent: request.get('user-agent') },
    );
    const csrfToken = this.cookies.issue(response, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    });
    return {
      outcome: 'AUTHENTICATED',
      userId: session.userId,
      organizationId: session.organizationId ?? null,
      csrfToken,
      expiresIn: session.expiresIn,
    };
  }
}
