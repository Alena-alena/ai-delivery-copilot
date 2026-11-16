import type { Request } from 'express';

/** The signed-in user, taken only from a verified Supabase access token. */
export interface AuthUser {
  id: string;
  email: string;
}

export type AuthedRequest = Request & { user?: AuthUser };
