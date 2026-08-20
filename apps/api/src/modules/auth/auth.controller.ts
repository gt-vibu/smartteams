import { Body, Controller, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  InvitationAcceptDto,
  LoginDto,
  PlatformLoginDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  RegisterDto,
} from './auth.dto';
import { NativeJwtGuard, type NativeRequestUser } from './jwt.guard';
import { AuthRateLimitInterceptor } from './auth-rate-limit.interceptor';

@Controller('v1/auth')
@UseInterceptors(AuthRateLimitInterceptor)
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }
  @Post('login') login(@Body() body: LoginDto, @Req() request: Request) {
    return this.auth.login(body.email, body.password, body.organizationId, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }
  @Post('platform-login') platformLogin(@Body() body: PlatformLoginDto, @Req() request: Request) {
    return this.auth.platformLogin(body.email, body.password, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }
  @Post('refresh') refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }
  @Post('logout') @UseGuards(NativeJwtGuard) async logout(
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    await this.auth.logout(request.user.sessionId);
    return { success: true };
  }
  @Post('password-reset/request') requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(body.email, body.organizationId);
  }
  @Post('password-reset/confirm') confirmPasswordReset(@Body() body: PasswordResetConfirmDto) {
    return this.auth.resetPassword(body.token, body.password);
  }
  @Post('invitations/accept') acceptInvitation(@Body() body: InvitationAcceptDto) {
    return this.auth.acceptInvitation(body.token, body.displayName, body.password);
  }
}
