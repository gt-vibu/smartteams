import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/http/problem-details.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(app.get(ProblemDetailsFilter));
  app.enableShutdownHooks();
  const expressApplication = app.getHttpAdapter().getInstance() as {
    set(name: string, value: unknown): void;
  };
  expressApplication.set('trust proxy', config.getOrThrow<number>('TRUST_PROXY_HOPS'));
  app.enableCors({
    credentials: true,
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smarteam V2 API')
    .setDescription('People Management, native application, and BlizBooks federation APIs.')
    .setVersion(config.getOrThrow<string>('APP_VERSION'))
    .addBearerAuth()
    .build();
  if (config.getOrThrow<boolean>('SWAGGER_ENABLED')) {
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const host = config.getOrThrow<string>('API_HOST');
  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port, host);
}

void bootstrap();
