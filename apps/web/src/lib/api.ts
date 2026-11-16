import { supabase } from '@/lib/supabase';

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId?: string;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}

async function accessToken(refresh = false): Promise<string | null> {
  const { data } = refresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Runs an authenticated call. On 401 the token may just have expired: refresh the session once and retry.
 * If it still fails the session is dead, so sign out; the protected routes then send the user to /login.
 * Every call that carries the token (JSON requests, downloads, uploads) goes through here.
 */
async function withFreshToken<T extends { status: number }>(
  run: (token: string | null) => Promise<T>,
): Promise<T> {
  let token = await accessToken();
  let result = await run(token);
  if (result.status === 401 && token) {
    token = await accessToken(true);
    result = token ? await run(token) : result;
    if (result.status === 401) await supabase.auth.signOut();
  }
  return result;
}

async function send(path: string, init: RequestInit | undefined, token: string | null) {
  const headers = new Headers(init?.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`/api${path}`, { ...init, headers });
}

async function failure(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(res.status, body ?? { code: 'UNKNOWN', message: res.statusText });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await withFreshToken((token) => send(path, init, token));
  if (!res.ok) throw await failure(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function apiDelete(path: string): Promise<void> {
  return request<void>(path, { method: 'DELETE' });
}

/** Downloads a file that needs the sign-in token (a plain link cannot send the Authorization header). */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await withFreshToken((token) => send(path, undefined, token));
  if (!res.ok) throw await failure(res);
  return res.blob();
}

interface UploadResult {
  status: number;
  body: unknown;
}

/** Uploads one file with progress (fetch cannot report upload progress, XMLHttpRequest can). */
export async function apiUpload<T>(
  path: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<T> {
  const attempt = (token: string | null) =>
    new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${path}`);
      if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // not JSON: handled by the caller
        }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () =>
        reject(new ApiError(0, { code: 'NETWORK_ERROR', message: 'Network error during upload' }));
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });

  const { status, body } = await withFreshToken(attempt);
  if (status >= 200 && status < 300) return body as T;
  throw new ApiError(
    status,
    (body as ApiErrorBody | null) ?? { code: 'UNKNOWN', message: `Upload failed (${status})` },
  );
}
