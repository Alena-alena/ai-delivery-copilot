import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { SystemController } from './system/system.controller.js';
import { validateEnv, type Env } from './config/env.js';
import { LOG_REDACT } from './common/log-redact.js';
import { resolveRequestId } from './common/request-id.js';
import { AiModule } from './ai/ai.module.js';
import { DevController } from './dev/dev.controller.js';
import { DevOnlyGuard } from './dev/dev-only.guard.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    AiModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req, res) => {
            const id = resolveRequestId(req.headers['x-request-id']);
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: LOG_REDACT,
          customProps: (req) => ({ requestId: req.id }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
  controllers: [HealthController, SystemController, DevController],
  providers: [DevOnlyGuard],
})
export class AppModule {}
