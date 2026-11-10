import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configError =
  !url || !anonKey
    ? 'Supabase is not configured. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    : null;

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Turns a Supabase/PostgREST error into a message suitable for laboratory users. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  const e = err as { message?: string; code?: string; details?: string };
  const msg = e.message ?? String(err);
  if (/row-level security/i.test(msg)) return 'You do not have permission to make this change.';
  if (/JWT expired/i.test(msg)) return 'Your session has expired. Please sign in again.';
  if (/Failed to fetch/i.test(msg)) return 'Cannot reach the server. Check your internet connection.';
  return msg.replace(/^CONFLICT:\s*/, 'Conflict: ');
}

export function isConflict(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return e?.code === '40001' || /^CONFLICT/.test(e?.message ?? '');
}
