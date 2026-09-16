import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { NativeJwtGuard, type NativeRequestUser } from '../auth/jwt.guard';
import { FederationClientDto, FederationClientCertificateDto } from './platform-admin.dto';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformService } from './platform.service';

@Controller('v1/platform')
@UseGuards(NativeJwtGuard, PlatformAuthGuard)
export class PlatformAdminController {
  constructor(private readonly platform: PlatformService) {}

  @Get('federation-clients')
  clients(@Req() request: Request & { user: NativeRequestUser }) {
    return this.platform.listClients(request.user.userId);
  }

  @Post('federation-clients') client(
    @Body() body: FederationClientDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.createClient(request.user.userId, body);
  }
  @Post('federation-clients/:clientId/credentials/rotate') rotate(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.rotateCredential(request.user.userId, clientId);
  }

  @Patch('federation-clients/:clientId/certificate-fingerprints') certificates(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() body: FederationClientCertificateDto,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.updateCertificateFingerprints(request.user.userId, clientId, body);
  }

  @Patch('federation-clients/:clientId/enable') enable(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.setClientEnabled(request.user.userId, clientId, true);
  }

  @Patch('federation-clients/:clientId/disable') disable(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.setClientEnabled(request.user.userId, clientId, false);
  }

  @Delete('federation-clients/:clientId') delete(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Req() request: Request & { user: NativeRequestUser },
  ) {
    return this.platform.deleteClient(request.user.userId, clientId);
  }
}
