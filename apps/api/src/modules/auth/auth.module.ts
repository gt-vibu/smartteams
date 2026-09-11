import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthActivationService } from './auth.activation.service';
import { AuthController } from './auth.controller';
import { AuthCookieService } from './auth.cookies';
import { AuthIdentityService } from './auth.identity.service';
import { PasswordService } from './auth.passwords';
import { AuthRecoveryService } from './auth.recovery.service';
import { AuthRegistrationService } from './auth.registration.service';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth.session.service';
import { AuthTokenService } from './auth.tokens';
import { NativeJwtGuard } from './jwt.guard';
import { AuthRateLimitInterceptor } from './auth-rate-limit.interceptor';

const providers = [
  AuthService,
  AuthSessionService,
  AuthRegistrationService,
  AuthActivationService,
  AuthRecoveryService,
  AuthIdentityService,
  AuthTokenService,
  AuthCookieService,
  PasswordService,
  NativeJwtGuard,
  AuthRateLimitInterceptor,
];

@Global()
@Module({
  controllers: [AuthController],
  exports: [
    AuthService,
    AuthSessionService,
    AuthCookieService,
    AuthTokenService,
    PasswordService,
    NativeJwtGuard,
    JwtModule,
  ],
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const audience = config.getOrThrow<string>('JWT_AUDIENCE');
        const issuer = config.getOrThrow<string>('JWT_ISSUER');
        return {
          // No fallback. JWT_SECRET is required by the environment schema; falling back to
          // FEDERATION_BOOTSTRAP_SECRET would sign user sessions with a shorter secret
          // belonging to a different trust domain.
          secret: config.getOrThrow<string>('JWT_SECRET'),
          // `issuer` and `audience` must appear in BOTH halves. They are only meaningful as a
          // claim that is written at signing time and checked at verification time; setting
          // them on one side alone either enforces nothing or rejects every token.
          signOptions: {
            algorithm: 'HS256',
            audience,
            issuer,
            expiresIn: config.get<number>('JWT_ACCESS_TOKEN_TTL_SECONDS', 900),
          },
          verifyOptions: {
            algorithms: ['HS256'],
            audience,
            issuer,
          },
        };
      },
    }),
  ],
  providers,
})
export class AuthModule {}
