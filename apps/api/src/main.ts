import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
}
await bootstrap();
