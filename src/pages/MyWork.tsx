import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/format';
import type { RegisterRow } from '../lib/types';
import { Empty, ErrorBox, PriorityBadge, Spinner, StatusBadge } from '../components/ui';

interface Section { key: string; title: string; hint: string; rows: RegisterRow[] }

const COLS = 'id,action_no,title,status,is_blocked,priority,due_date,owner_id,owner_name,created_by,department_id,department_code,is_overdue,days_overdue,is_due_soon,verification_submitted_by';

export default function MyWork() {
  const { profile, has, managesDept } = useAuth();
  const me = profile!.id;
  const [sections, setSections] = useState<Section[] | null>(null);
  const [counts, setCounts] = useState({ open: 0, overdue: 0, soon: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const isQM = has('quality_manager');
        const isRev = has('reviewer') || isQM;
        const [mine, assignedIds, submitted, verify, eff, closure, open] = await Promise.all([
          supabase.from('action_register_v').select(COLS).eq('owner_id', me).not('status', 'in', '(closed,rejected)').order('due_date'),
          supabase.from('action_assignments').select('action_id').eq('user_id', me),
          supabase.from('action_register_v').select(COLS).eq('status', 'submitted').order('due_date'),
          isRev ? supabase.from('action_register_v').select(COLS).eq('status', 'pending_verification').order('due_date') : null,
          isRev ? supabase.from('action_register_v').select(COLS).eq('status', 'effectiveness_review').order('due_date') : null,
          isQM ? supabase.from('action_register_v').select(COLS).eq('status', 'pending_closure').order('due_date') : null,
          supabase.from('action_register_v').select('is_overdue,is_due_soon').in('status', ['draft', 'submitted', 'approved', 'in_progress']),
        ]);
        for (const r of [mine, assignedIds, submitted, verify, eff, closure, open]) if (r?.error) throw r.error;

        const ids = (assignedIds.data ?? []).map(a => a.action_id as string);
        const assigned = ids.length
          ? await supabase.from('action_register_v').select(COLS).in('id', ids).not('status', 'in', '(closed,rejected)').order('due_date')
          : { data: [], error: null };
        if (assigned.error) throw assigned.error;

        const notMine = (r: RegisterRow) => r.owner_id !== me && r.created_by !== me;
        const approvals = ((submitted.data ?? []) as unknown as RegisterRow[])
          .filter(r => notMine(r) && (isQM || managesDept(r.department_id)));
        const assignedRows = (assigned.data ?? []) as unknown as RegisterRow[];
        const assignedSet = new Set(assignedRows.map(r => r.id));
        const reviewable = (rows: RegisterRow[] | null | undefined) =>
          (rows ?? []).filter(r => r.owner_id !== me && !assignedSet.has(r.id) && r.verification_submitted_by !== me);

        const list: Section[] = [
          { key: 'approve', title: 'Awaiting my approval', hint: 'Submitted actions you may approve, return or reject', rows: approvals },
          { key: 'verify', title: 'Awaiting verification', hint: 'Implementation to verify — not your own work', rows: reviewable(verify?.data as unknown as RegisterRow[]) },
          { key: 'eff', title: 'Awaiting effectiveness review', hint: 'Check the measurable target was achieved', rows: reviewable(eff?.data as unknown as RegisterRow[]) },
          { key: 'close', title: 'Ready for closure', hint: 'Verified and effective — authorize closure', rows: ((closure?.data ?? []) as unknown as RegisterRow[]).filter(r => r.owner_id !== me) },
          { key: 'mine', title: 'Actions I own', hint: 'You are accountable for these', rows: (mine.data ?? []) as unknown as RegisterRow[] },
          { key: 'assigned', title: 'Assigned to me', hint: 'You are working on these', rows: assignedRows },
        ];
        setSections(list.filter(s => s.rows.length > 0 || ['mine'].includes(s.key)));
        const o = (open.data ?? []) as { is_overdue: boolean; is_due_soon: boolean }[];
        setCounts({ open: o.length, overdue: o.filter(x => x.is_overdue).length, soon: o.filter(x => x.is_due_soon).length });
      } catch (e) { setError(errorMessage(e)); }
    })();
  }, [me, has, managesDept]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Good to see you, {profile?.full_name?.split(' ')[0] || 'colleague'}</h1>
          <p className="muted">Your queue across every action you can see.</p>
        </div>
      </header>
      <ErrorBox error={error} />
      <div className="stat-row">
        <Link to="/actions?view=open" className="stat"><span className="stat-n">{counts.open}</span><span>Open actions</span></Link>
        <Link to="/actions?overdue=1" className={`stat ${counts.overdue ? 'stat-alert' : ''}`}><span className="stat-n">{counts.overdue}</span><span>Overdue</span></Link>
        <Link to="/actions?soon=1" className="stat"><span className="stat-n">{counts.soon}</span><span>Due soon</span></Link>
      </div>
      {!sections && !error && <Spinner />}
      {sections?.map(s => (
        <section key={s.key} className="card">
          <div className="card-head"><h2>{s.title} <span className="count">{s.rows.length}</span></h2><span className="muted small">{s.hint}</span></div>
          {s.rows.length === 0 ? <Empty title="Nothing here" /> : (
            <ul className="worklist">
              {s.rows.map(r => (
                <li key={r.id}>
                  <Link to={`/actions/${r.id}`}>
                    <span className="mono">{r.action_no}</span>
                    <span className="wl-title">{r.title}</span>
                    <span className="wl-meta">
                      <StatusBadge status={r.status} blocked={r.is_blocked} />
                      <PriorityBadge p={r.priority} />
                      <span className={r.is_overdue ? 'overdue' : r.is_due_soon ? 'due-soon' : 'muted'}>
                        {r.is_overdue ? `${r.days_overdue} d overdue` : `Due ${fmtDate(r.due_date)}`}
                      </span>
                      <span className="muted">{r.department_code} · {r.owner_name}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
