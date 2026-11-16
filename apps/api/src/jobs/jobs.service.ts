import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import type { Env } from '../config/env.js';

/**
 * The job queue. pg-boss keeps jobs in our own Postgres (schema "pgboss"), so queued work survives
 * an API restart and no extra service (Redis) is needed. It needs a real database session, so it
 * connects with DATABASE_MIGRATION_URL (the session pooler), not the transaction pooler.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  readonly boss: PgBoss;

  constructor(config: ConfigService<Env, true>) {
    this.boss = new PgBoss({
      connectionString: config.get('DATABASE_MIGRATION_URL', { infer: true }),
      application_name: 'copilot-jobs',
      max: 4,
    });
    this.boss.on('error', (err) =>
      this.logger.error(`pg-boss error: ${String(err)}`),
    );
  }

  async onModuleInit() {
    // Fails the boot if the database is unreachable: better than accepting uploads that never run.
    await this.boss.start();
  }

  async onModuleDestroy() {
    await this.boss.stop({ graceful: true, timeout: 10_000 });
  }
}
