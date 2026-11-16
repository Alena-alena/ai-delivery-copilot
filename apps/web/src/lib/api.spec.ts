import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

import { ApiError, apiBlob, apiDelete, apiGet, apiUpload } from './api';

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

/** A scripted XMLHttpRequest: each send() consumes the next planned outcome. */
type Planned = { status: number; body?: unknown } | 'network-error';
const xhrPlan: Planned[] = [];
const xhrSeen: { token: string | null }[] = [];

class FakeXhr {
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  responseText = '';
  statusText = '';
  private token: string | null = null;
  open() {}
  setRequestHeader(name: string, value: string) {
    if (name === 'authorization') this.token = value;
  }
  send() {
    xhrSeen.push({ token: this.token });
    const next = xhrPlan.shift();
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
      if (next === 'network-error' || !next) return this.onerror?.();
      this.status = next.status;
      this.responseText = next.body === undefined ? '' : JSON.stringify(next.body);
      this.onload?.();
    });
  }
}

describe('uploads and downloads share the same 401 handling', () => {
  const file = new File(['hello'], 'a.txt');

  beforeEach(() => {
    xhrPlan.length = 0;
    xhrSeen.length = 0;
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('uploads with the Bearer token and reports progress', async () => {
    xhrPlan.push({ status: 201, body: { id: 'doc-1' } });
    const progress = vi.fn();
    await expect(apiUpload('/projects/p/documents', file, progress)).resolves.toEqual({
      id: 'doc-1',
    });
    expect(xhrSeen[0]!.token).toBe('Bearer old-token');
    expect(progress).toHaveBeenCalledWith(0.5);
  });

  it('refreshes the session and retries the upload once when the token has expired', async () => {
    xhrPlan.push({ status: 401, body: { code: 'UNAUTHORIZED', message: 'expired' } });
    xhrPlan.push({ status: 201, body: { id: 'doc-2' } });
    auth.refreshSession.mockResolvedValue(session('new-token'));

    await expect(apiUpload('/x', file, () => {})).resolves.toEqual({ id: 'doc-2' });
    expect(xhrSeen.map((x) => x.token)).toEqual(['Bearer old-token', 'Bearer new-token']);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('signs out when the upload is rejected again after a refresh', async () => {
    xhrPlan.push({ status: 401, body: { code: 'UNAUTHORIZED', message: 'bad' } });
    xhrPlan.push({ status: 401, body: { code: 'UNAUTHORIZED', message: 'bad' } });
    auth.refreshSession.mockResolvedValue(session('still-bad'));

    const error = (await apiUpload('/x', file, () => {}).catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(401);
    expect(xhrSeen).toHaveLength(2); // one retry, no loop
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the API error code for a rejected file and does not touch the session', async () => {
    xhrPlan.push({ status: 415, body: { code: 'UNSUPPORTED_TYPE', message: 'nope' } });
    const error = (await apiUpload('/x', file, () => {}).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.body.code).toBe('UNSUPPORTED_TYPE');
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it('turns a dropped connection into a NETWORK_ERROR', async () => {
    xhrPlan.push('network-error');
    const error = (await apiUpload('/x', file, () => {}).catch((e: unknown) => e)) as ApiError;
    expect(error.body.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
  });

  it('downloads retry on 401 too', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHORIZED', message: 'expired' }))
      .mockResolvedValueOnce(new Response('file-bytes', { status: 200 }));
    auth.refreshSession.mockResolvedValue(session('new-token'));
    const blob = await apiBlob('/projects/p/documents/d/download');
    expect(await blob.text()).toBe('file-bytes');
    expect(tokenOf(1)).toBe('Bearer new-token');
  });
});
