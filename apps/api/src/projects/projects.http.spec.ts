import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOB, as, createTestApp } from '../testing/test-app.js';

const MISSING = '33333333-3333-4333-8333-333333333333';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
const http = () => ctx.http();

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx?.close();
});

describe('authentication', () => {
  it('rejects requests without a valid token (401)', async () => {
    await http().get('/api/projects').expect(401);
    await http().get('/api/projects').set(as('forged')).expect(401);
    await http().post('/api/projects').send({ name: 'x' }).expect(401);
  });

  it('provisions a personal workspace on first request, once per user', async () => {
    const first = await http()
      .get('/api/auth/me')
      .set(as('token-alice'))
      .expect(200);
    const again = await http()
      .get('/api/auth/me')
      .set(as('token-alice'))
      .expect(200);
    expect(first.body.workspaces).toHaveLength(1);
    expect(first.body.workspaces[0]).toMatchObject({ role: 'owner' });
    expect(again.body.workspaces).toEqual(first.body.workspaces);

    const bob = await http()
      .get('/api/auth/me')
      .set(as('token-bob'))
      .expect(200);
    expect(bob.body.workspaces[0].id).not.toBe(first.body.workspaces[0].id);
  });
});

describe('projects CRUD', () => {
  it('creates, reads, updates and deletes a project', async () => {
    const created = await http()
      .post('/api/projects')
      .set(as('token-alice'))
      .send({ name: '  Billing portal  ', description: 'Client portal' })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Billing portal',
      description: 'Client portal',
    });
    const id = created.body.id as string;

    await http().get(`/api/projects/${id}`).set(as('token-alice')).expect(200);

    const patched = await http()
      .patch(`/api/projects/${id}`)
      .set(as('token-alice'))
      .send({ name: 'Billing v2', description: '' })
      .expect(200);
    expect(patched.body).toMatchObject({
      name: 'Billing v2',
      description: null,
    });
    expect(new Date(patched.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.body.updatedAt).getTime(),
    );

    await http()
      .delete(`/api/projects/${id}`)
      .set(as('token-alice'))
      .expect(204);
    await http().get(`/api/projects/${id}`).set(as('token-alice')).expect(404);
  });

  it('lists newest first', async () => {
    const a = await http()
      .post('/api/projects')
      .set(as('token-alice'))
      .send({ name: 'first' });
    const b = await http()
      .post('/api/projects')
      .set(as('token-alice'))
      .send({ name: 'second' });
    const list = await http()
      .get('/api/projects')
      .set(as('token-alice'))
      .expect(200);
    const ids = list.body.map((p: { id: string }) => p.id);
    expect(ids.indexOf(b.body.id)).toBeLessThan(ids.indexOf(a.body.id));
  });
});

describe("another user's projects (IDOR)", () => {
  it('cannot read, change, delete or even see them: always 404', async () => {
    const created = await http()
      .post('/api/projects')
      .set(as('token-alice'))
      .send({ name: 'Alice secret' })
      .expect(201);
    const id = created.body.id as string;
    const bob = as('token-bob');

    await http().get(`/api/projects/${id}`).set(bob).expect(404);
    await http()
      .patch(`/api/projects/${id}`)
      .set(bob)
      .send({ name: 'pwned' })
      .expect(404);
    await http().delete(`/api/projects/${id}`).set(bob).expect(404);

    const bobList = await http().get('/api/projects').set(bob).expect(200);
    expect(bobList.body.map((p: { id: string }) => p.id)).not.toContain(id);

    // untouched by Bob's attempts
    const still = await http()
      .get(`/api/projects/${id}`)
      .set(as('token-alice'))
      .expect(200);
    expect(still.body.name).toBe('Alice secret');
  });

  it('answers a foreign project exactly like a missing one (no id enumeration)', async () => {
    const created = await http()
      .post('/api/projects')
      .set(as('token-alice'))
      .send({ name: 'p' });
    const foreign = await http()
      .get(`/api/projects/${created.body.id}`)
      .set(as('token-bob'));
    const missing = await http()
      .get(`/api/projects/${MISSING}`)
      .set(as('token-bob'));
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body.code).toBe(missing.body.code);
    expect(foreign.body.message).toBe(missing.body.message);
  });

  it('ignores a workspaceId or createdBy sent in the body', async () => {
    const bobMe = await http().get('/api/auth/me').set(as('token-bob'));
    const created = await http()
      .post('/api/projects')
      .set(as('token-alice'))
      .send({
        name: 'mine',
        workspaceId: bobMe.body.workspaces[0].id,
        createdBy: BOB.id,
      })
      .expect(201);
    const bobList = await http().get('/api/projects').set(as('token-bob'));
    expect(bobList.body.map((p: { id: string }) => p.id)).not.toContain(
      created.body.id,
    );
  });
});

describe('validation', () => {
  it('rejects bad input with 400 VALIDATION_ERROR', async () => {
    for (const body of [
      {},
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(101) },
    ]) {
      const res = await http()
        .post('/api/projects')
        .set(as('token-alice'))
        .send(body)
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects an empty PATCH and a malformed id', async () => {
    const created = await http()
      .post('/api/projects')
      .set(as('token-alice'))
      .send({ name: 'p' });
    await http()
      .patch(`/api/projects/${created.body.id}`)
      .set(as('token-alice'))
      .send({})
      .expect(400);
    await http()
      .get('/api/projects/not-a-uuid')
      .set(as('token-alice'))
      .expect(400);
  });
});
