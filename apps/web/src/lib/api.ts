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

async function send(path: string, init: RequestInit | undefined, token: string | null) {
  const headers = new Headers(init?.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`/api${path}`, { ...init, headers });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let token = await accessToken();
  let res = await send(path, init, token);

  if (res.status === 401 && token) {
    // Token may have just expired: refresh once and retry. If it still fails the session is
    // dead, so sign out; the protected routes then send the user to /login.
    token = await accessToken(true);
    res = token ? await send(path, init, token) : res;
    if (res.status === 401) await supabase.auth.signOut();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body ?? { code: 'UNKNOWN', message: res.statusText });
  }
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
  const token = await accessToken();
  const res = await send(path, undefined, token);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body ?? { code: 'UNKNOWN', message: res.statusText });
  }
  return res.blob();
}

/** Uploads one file with progress (fetch cannot report upload progress, XMLHttpRequest can). */
export async function apiUpload<T>(
  path: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<T> {
  const token = await accessToken();
  return new Promise<T>((resolve, reject) => {
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
        // not JSON: handled below
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else {
        reject(
          new ApiError(
            xhr.status,
            (body as ApiErrorBody | null) ?? { code: 'UNKNOWN', message: xhr.statusText },
          ),
        );
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, { code: 'NETWORK_ERROR', message: 'Network error during upload' }));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
