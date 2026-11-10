import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { errorMessage, supabase } from './supabase';
import type { AppRole, Profile } from './types';

interface RoleGrant { role: AppRole; department_id: string | null }

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  roles: RoleGrant[];
  loading: boolean;
  loadError: string | null;
  recovery: boolean;
  has: (role: AppRole) => boolean;
  managesDept: (departmentId: string) => boolean;
  canCreate: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  clearRecovery: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<RoleGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Invitation and reset links land with type=invite / type=recovery in the URL: ask for a password.
  const [recovery, setRecovery] = useState(() => /type=(invite|recovery)/.test(window.location.hash + window.location.search));

  const loadUser = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setRoles([]); return; }
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.rpc('my_roles'),
    ]);
    if (p.error || r.error || !p.data) {
      setLoadError(errorMessage(p.error ?? r.error ?? 'Your user profile was not found. Ask an administrator to check your account.'));
    } else setLoadError(null);
    setProfile((p.data as Profile) ?? null);
    setRoles((r.data as RoleGrant[]) ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadUser(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
      // defer to avoid calling supabase inside the auth callback
      setTimeout(() => { loadUser(s); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUser]);

  const value = useMemo<AuthState>(() => {
    const has = (role: AppRole) => roles.some(r => r.role === role);
    const managesDept = (d: string) => roles.some(r => r.role === 'department_manager' && r.department_id === d);
    return {
      session, profile, roles, loading, loadError, recovery, has, managesDept,
      canCreate: has('quality_manager') || has('department_manager') || has('action_owner'),
      refresh: () => loadUser(session),
      signOut: async () => { await supabase.auth.signOut(); },
      clearRecovery: () => setRecovery(false),
    };
  }, [session, profile, roles, loading, loadError, recovery, loadUser]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
