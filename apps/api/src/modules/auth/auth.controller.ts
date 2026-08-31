import { Body, Controller, Get, Post, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedSession, LoginResponse } from '@smarteam/contracts';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { AuthCookieService } from './auth.cookies';
import { AuthIdentityService } from './auth.identity.service';
import { AuthRecoveryService } from './auth.recovery.service';
import { AuthRegistrationService } from './auth.registration.service';
import { AuthService } from './auth.service';
import type { IssuedSession, SessionMetadata } from './auth.session.service';
import {
  InvitationAcceptDto,
  LoginDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  PlatformLoginDto,
  RegisterDto,
} from './auth.dto';
import { NativeJwtGuard, type NativeRequestUser } from './jwt.guard';
import { AuthRateLimitInterceptor } from './auth-rate-limit.interceptor';

type AuthedRequest = Request & { user: NativeRequestUser };

/**
 * Every endpoint that establishes or renews a session writes its tokens to HttpOnly cookies
 * and returns only non-secret metadata. No response body on this controller contains an
 * access token, a refresh token, or any password material.
 */
@Controller('v1/auth')
@UseInterceptors(AuthRateLimitInterceptor)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: AuthRegistrationService,
    private readonly recovery: AuthRecoveryService,
    private readonly identity: AuthIdentityService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    return this.establish(await this.registration.register(body), response);
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(
      body.email,
      body.password,
      body.organizationId,
      metadataOf(request),
    );
    if (result.outcome === 'ORGANIZATION_SELECTION_REQUIRED') {
      return { outcome: result.outcome, organizations: result.organizations };
    }
    return this.establish(result.session, response);
  }

  @Post('platform-login')
  async platformLogin(
    @Body() body: PlatformLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const session = await this.auth.platformLogin(body.email, body.password, metadataOf(request));
    return this.establish(session, response);
  }

  /**
   * Renews the session. The refresh token is read from its path-scoped HttpOnly cookie, so it
   * is never handled by client code and never appears in a request body or a URL.
   */
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const refreshToken = this.cookies.readRefreshToken(request);
    if (!refreshToken) {
      this.cookies.clear(response);
      throw new UnauthorizedDomainError('The session could not be refreshed');
    }
    try {
      return this.establish(await this.auth.refresh(refreshToken, metadataOf(request)), response);
    } catch (error) {
      // A refusal is terminal for this browser session; drop the cookies so the client cannot
      // sit in a loop presenting a token that will never be accepted again.
      this.cookies.clear(response);
      throw error;
    }
  }

  /** The canonical authenticated identity. Derived entirely from the session. */
  @Get('me')
  @UseGuards(NativeJwtGuard)
  me(@Req() request: AuthedRequest): Promise<AuthenticatedSession> {
    return this.identity.describe(
      request.user.userId,
      request.user.sessionId,
      request.user.organizationId,
    );
  }

  @Post('logout')
  @UseGuards(NativeJwtGuard)
  async logout(@Req() request: AuthedRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.user.sessionId);
    this.cookies.clear(response);
    return { success: true };
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.recovery.requestPasswordReset(body.email, body.organizationId);
  }

  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() body: PasswordResetConfirmDto) {
    return this.recovery.resetPassword(body.token, body.password);
  }

  @Post('invitations/accept')
  async acceptInvitation(
    @Body() body: InvitationAcceptDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const session = await this.registration.acceptInvitation(
      body.token,
      body.displayName,
      body.password,
      metadataOf(request),
    );
    return this.establish(session, response);
  }

  /** Writes the session cookies and returns the non-secret half of the result. */
  private establish(session: IssuedSession, response: Response): LoginResponse {
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

function metadataOf(request: Request): SessionMetadata {
  return { ipAddress: request.ip, userAgent: request.get('user-agent') };
}
