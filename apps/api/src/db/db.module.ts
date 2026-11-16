import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { createDatabase, type Database } from './db.js';

export const DATABASE = Symbol('DATABASE');
const DB_HANDLE = Symbol('DB_HANDLE');

type Handle = ReturnType<typeof createDatabase>;

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Handle =>
        createDatabase(config.get('DATABASE_URL', { infer: true })),
    },
    {
      provide: DATABASE,
      inject: [DB_HANDLE],
      useFactory: (handle: Handle): Database => handle.db,
    },
  ],
  exports: [DATABASE],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(DB_HANDLE) private readonly handle: Handle) {}

  async onModuleDestroy() {
    await this.handle.close();
  }
}
