import { resolve } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseServerEnv } from '@smarteam/config';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: resolve(process.cwd(), '../../.env'),
      isGlobal: true,
      validate: (env) => parseServerEnv(env),
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
