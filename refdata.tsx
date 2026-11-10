import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Category, Department, IsoClause, Lookup, Profile, Settings, UserRole } from './types';
import { useAuth } from './auth';

interface RefData {
  departments: Department[];
  categories: Category[];
  sources: Lookup[];
  qse: Lookup[];
  clauses: IsoClause[];
  profiles: Profile[];
  userRoles: UserRole[];
  settings: Settings | null;
  loaded: boolean;
  reload: () => Promise<void>;
  name: (userId: string | null | undefined) => string;
  eligibleOwners: Profile[];
}

const Ctx = createContext<RefData | null>(null);

export function RefDataProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const [state, setState] = useState<Omit<RefData, 'reload' | 'name' | 'eligibleOwners'>>({
    departments: [], categories: [], sources: [], qse: [], clauses: [], profiles: [], userRoles: [],
    settings: null, loaded: false,
  });

  const reload = useCallback(async () => {
    const [d, c, s, q, cl, p, ur, st] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('action_categories').select('*').order('sort_order'),
      supabase.from('action_sources').select('*').order('sort_order'),
      supabase.from('qse_categories').select('*').order('sort_order'),
      supabase.from('iso_clauses').select('*').order('sort_order'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('user_roles').select('*'),
      supabase.from('action_settings').select('*').maybeSingle(),
    ]);
    setState({
      departments: (d.data ?? []) as Department[],
      categories: (c.data ?? []) as Category[],
      sources: (s.data ?? []) as Lookup[],
      qse: (q.data ?? []) as Lookup[],
      clauses: (cl.data ?? []) as IsoClause[],
      profiles: (p.data ?? []) as Profile[],
      userRoles: (ur.data ?? []) as UserRole[],
      settings: (st.data ?? null) as Settings | null,
      loaded: true,
    });
  }, []);

  useEffect(() => { if (session && profile?.active) reload(); }, [session, profile?.active, reload]);

  const value = useMemo<RefData>(() => {
    const byId = new Map(state.profiles.map(p => [p.id, p]));
    const ownerRoles = new Set(['action_owner', 'department_manager', 'quality_manager']);
    const eligible = new Set(state.userRoles.filter(r => ownerRoles.has(r.role)).map(r => r.user_id));
    return {
      ...state,
      reload,
      name: id => (id ? byId.get(id)?.full_name || byId.get(id)?.email || 'Unknown user' : '—'),
      eligibleOwners: state.profiles.filter(p => p.active && eligible.has(p.id)),
    };
  }, [state, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRefData(): RefData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRefData outside RefDataProvider');
  return v;
}
