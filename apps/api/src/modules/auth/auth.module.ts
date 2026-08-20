import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { NativeJwtGuard } from './jwt.guard';
import { AuthRateLimitInterceptor } from './auth-rate-limit.interceptor';

@Global()
@Module({
  controllers: [AuthController],
  exports: [AuthService, NativeJwtGuard, JwtModule],
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        issuer: config.getOrThrow<string>('JWT_ISSUER'),
        secret:
          config.get<string>('JWT_SECRET') ||
          config.getOrThrow<string>('FEDERATION_BOOTSTRAP_SECRET'),
        signOptions: { expiresIn: config.get<number>('JWT_ACCESS_TOKEN_TTL_SECONDS', 900) },
      }),
    }),
  ],
  providers: [AuthService, NativeJwtGuard, AuthRateLimitInterceptor],
})
export class AuthModule {}
