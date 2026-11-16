import {
  type INestApplication,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Logger } from 'nestjs-pino';
import request from 'supertest';
import { AuthController } from '../auth/auth.controller.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { InvalidTokenError, JwtVerifier } from '../auth/jwt-verifier.js';
import { UsersService } from '../auth/users.service.js';
import { AllExceptionsFilter } from '../common/all-exceptions.filter.js';
import { DATABASE } from '../db/db.module.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { ProjectsController } from '../projects/projects.controller.js';
import { ProjectsService } from '../projects/projects.service.js';
import { StorageService } from '../storage/storage.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb } from './test-db.js';

export const ALICE = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alice@x.co',
};
export const BOB = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'bob@x.co',
};
const USERS: Record<string, typeof ALICE> = {
  'token-alice': ALICE,
  'token-bob': BOB,
};

export const as = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * A real Nest app (controllers, guard, services, SQL on PGlite with the real migrations).
 * Only token verification is faked: "token-alice" and "token-bob" are valid, anything else is not.
 */
export async function createTestApp(
  extra: {
    controllers?: Type[];
    providers?: Provider[];
  } = {},
) {
  const testDb = await createTestDb();
  await testDb.addAuthUser(ALICE.id);
  await testDb.addAuthUser(BOB.id);

  const fakeVerifier = {
    verify: (token: string) => {
      const user = USERS[token];
      return user
        ? Promise.resolve(user)
        : Promise.reject(new InvalidTokenError('Invalid or expired token'));
    },
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [
      ProjectsController,
      AuthController,
      ...(extra.controllers ?? []),
    ],
    providers: [
      ProjectsService,
      ProjectAccessService,
      UsersService,
      { provide: DATABASE, useValue: testDb.db },
      // a throwaway folder; tests that care about files pass their own StorageService in `providers`
      {
        provide: StorageService,
        useValue: new LocalStorageService(
          mkdtempSync(path.join(os.tmpdir(), 'copilot-test-storage-')),
        ),
      },
      { provide: JwtVerifier, useValue: fakeVerifier },
      { provide: APP_GUARD, useClass: AuthGuard },
      ...(extra.providers ?? []),
    ],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalFilters(
    new AllExceptionsFilter({ error: () => undefined } as unknown as Logger),
  );
  await app.init();

  return {
    app,
    db: testDb.db,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await testDb.close();
    },
  };
}
