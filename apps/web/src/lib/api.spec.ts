import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

import { ApiError, apiDelete, apiGet } from './api';

const session = (token: string | null) => ({
  data: { session: token ? { access_token: token } : null },
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const fetchMock = vi.fn<typeof fetch>();
const tokenOf = (call: number) =>
  new Headers(fetchMock.mock.calls[call]![1]?.headers).get('authorization');

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  auth.getSession.mockResolvedValue(session('old-token'));
  auth.signOut.mockResolvedValue({ error: null });
});

describe('api client and 401 handling', () => {
  it('sends the access token as a Bearer header', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await expect(apiGet('/projects')).resolves.toEqual({ ok: true });
    expect(tokenOf(0)).toBe('Bearer old-token');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/projects');
  });

  it('on 401 refreshes the session once and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHORIZED', message: 'expired' }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    auth.refreshSession.mockResolvedValue(session('new-token'));

    await expect(apiGet('/projects')).resolves.toEqual({ ok: true });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenOf(0)).toBe('Bearer old-token');
    expect(tokenOf(1)).toBe('Bearer new-token');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('signs out (so the app goes to /login) when the retry is rejected too', async () => {
    fetchMock.mockResolvedValue(json(401, { code: 'UNAUTHORIZED', message: 'bad token' }));
    auth.refreshSession.mockResolvedValue(session('still-bad'));

    const error = await apiGet('/projects').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one retry only, never a loop
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the session cannot be refreshed at all', async () => {
    fetchMock.mockResolvedValue(json(401, { code: 'UNAUTHORIZED', message: 'expired' }));
    auth.refreshSession.mockResolvedValue(session(null));

    await expect(apiGet('/projects')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing to retry with
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('does not refresh or sign out for other errors, and keeps the API error body', async () => {
    fetchMock.mockResolvedValue(json(404, { code: 'NOT_FOUND', message: 'Project not found' }));
    const error = (await apiGet('/projects/x').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(404);
    expect(error.body.code).toBe('NOT_FOUND');
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('does not try to refresh when nobody is signed in', async () => {
    auth.getSession.mockResolvedValue(session(null));
    fetchMock.mockResolvedValue(json(401, { code: 'UNAUTHORIZED', message: 'no token' }));
    await expect(apiGet('/projects')).rejects.toBeInstanceOf(ApiError);
    expect(tokenOf(0)).toBeNull();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it('treats 204 No Content as success with no body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiDelete('/projects/x')).resolves.toBeUndefined();
  });
});
