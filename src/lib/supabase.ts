import { createClient } from '@supabase/supabase-js';

/** Accepts common copy-paste variants and returns https://<ref>.supabase.co */
function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let u = raw.trim().replace(/^["']|["']$/g, '');
  // Dashboard address pasted by mistake: https://supabase.com/dashboard/project/<ref>/...
  const dash = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1]}.supabase.co`;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    return new URL(u).origin; // drops /rest/v1/, /auth/v1, trailing slashes, query strings
  } catch {
    return u;
  }
}

const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim().replace(/^["']|["']$/g, '');

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
