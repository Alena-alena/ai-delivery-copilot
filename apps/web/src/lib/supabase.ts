import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** False until both public values are in the root .env (the app then shows a setup message). */
export const supabaseConfigured = Boolean(url && key);

// The browser only signs in through Supabase; all data goes through our own API.
// The publishable key is public by design. The service-role key must never be used here.
export const supabase = createClient(url || 'http://localhost:0', key || 'not-configured');
