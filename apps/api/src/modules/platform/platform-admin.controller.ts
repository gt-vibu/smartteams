import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import {
  FederationClientDto,
  ClientStatusDto,
  CredentialRevokeDto,
  CredentialRotationDto,
  GrantDto,
} from './platform-admin.dto';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformService } from './platform.service';

@Controller('v1/platform')
@UseGuards(NativeJwtGuard, PlatformAuthGuard)
export class PlatformAdminController {
  constructor(private readonly platform: PlatformService) {}
  @Post('federation-clients') client(
    @Body() body: FederationClientDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.createClient(request.user.userId, body);
  }
  @Post('federation-clients/:clientId/credentials/rotate') rotate(
    @Param('clientId') clientId: string,
    @Body() body: CredentialRotationDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.rotateCredential(request.user.userId, clientId, body.reason);
  }
  @Post('federation-credentials/:credentialId/revoke') revoke(
    @Param('credentialId') credentialId: string,
    @Body() body: CredentialRevokeDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.revokeCredential(request.user.userId, credentialId, body.reason);
  }
  @Post('federation-clients/:clientId/status') status(
    @Param('clientId') clientId: string,
    @Body() body: ClientStatusDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.changeClientStatus(
      request.user.userId,
      clientId,
      body.status,
      body.reason,
    );
  }
  @Post('federation-grants') grant(
    @Body() body: GrantDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.createGrant(request.user.userId, body);
  }
}
