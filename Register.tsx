import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useRefData } from '../lib/refdata';
import { fmtDate, PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER } from '../lib/format';
import { exportRegister } from '../lib/exportExcel';
import type { RegisterRow } from '../lib/types';
import { Empty, ErrorBox, PriorityBadge, RiskBadge, Spinner, StatusBadge, useToast } from '../components/ui';

const PAGE_SIZE = 25;
type SortKey = 'action_no' | 'title' | 'category_name' | 'department_code' | 'priority' | 'risk_score' | 'owner_name' | 'due_date' | 'status';
const SORTABLE: { key: SortKey; label: string }[] = [
  { key: 'action_no', label: 'Action ID' }, { key: 'title', label: 'Title' }, { key: 'category_name', label: 'Category' },
  { key: 'department_code', label: 'Dept' }, { key: 'priority', label: 'Priority' }, { key: 'risk_score', label: 'Risk' },
  { key: 'owner_name', label: 'Owner' }, { key: 'due_date', label: 'Due' }, { key: 'status', label: 'Status' },
];

export default function Register() {
  const { profile, canCreate } = useAuth();
  const ref = useRefData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<RegisterRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [qInput, setQInput] = useState(params.get('q') ?? '');

  const f = useMemo(() => ({
    q: params.get('q') ?? '',
    view: params.get('view') ?? 'all',          // all | open | <status>
    category: params.get('category') ?? '',
    department: params.get('department') ?? '',
    qse: params.get('qse') ?? '',
    priority: params.get('priority') ?? '',
    overdue: params.get('overdue') === '1',
    soon: params.get('soon') === '1',
    mine: params.get('mine') === '1',
    sort: (params.get('sort') as SortKey) || 'due_date',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Number(params.get('page') ?? 1)),
  }), [params]);

  const set = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = useCallback((query: any) => {
    let q = query;
    const term = f.q.replace(/[,()%*\\]/g, ' ').trim();
    if (term) q = q.or(`title.ilike.%${term}%,action_no.ilike.%${term}%,description.ilike.%${term}%,owner_name.ilike.%${term}%`);
    if (f.view === 'open') q = q.not('status', 'in', '(closed,rejected)');
    else if (f.view !== 'all') q = q.eq('status', f.view);
    if (f.category) q = q.eq('category_id', f.category);
    if (f.department) q = q.eq('department_id', f.department);
    if (f.qse) q = q.eq('qse_id', f.qse);
    if (f.priority) q = q.eq('priority', f.priority);
    if (f.overdue) q = q.eq('is_overdue', true);
    if (f.soon) q = q.eq('is_due_soon', true);
    if (f.mine && profile) q = q.eq('owner_id', profile.id);
    return q;
  }, [f, profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const from = (f.page - 1) * PAGE_SIZE;
      const query = applyFilters(supabase.from('action_register_v').select('*', { count: 'exact' }))
        .order(f.sort, { ascending: f.dir === 'asc' })
        .order('action_no', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      const { data, error, count } = await query;
      if (cancelled) return;
      if (error) { setError(errorMessage(error)); setRows([]); return; }
      setRows((data ?? []) as RegisterRow[]);
      setTotal(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [f, applyFilters]);

  useEffect(() => {
    const t = setTimeout(() => { if (qInput !== f.q) set({ q: qInput || null }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  async function doExport() {
    setExporting(true);
    try {
      const all: RegisterRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await applyFilters(supabase.from('action_register_v').select('*'))
          .order(f.sort, { ascending: f.dir === 'asc' }).order('action_no').range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as RegisterRow[]));
        if (!data || data.length < 1000) break;
      }
      await exportRegister(all, describeFilters(), profile?.full_name || profile?.email || '');
      toast(`Exported ${all.length} actions to Excel`);
    } catch (e) { toast(errorMessage(e), 'error'); }
    setExporting(false);
  }

  function describeFilters() {
    const parts: string[] = [];
    if (f.q) parts.push(`search "${f.q}"`);
    if (f.view !== 'all') parts.push(f.view === 'open' ? 'open only' : `status ${STATUS_LABEL[f.view as keyof typeof STATUS_LABEL]}`);
    if (f.category) parts.push(`category ${ref.categories.find(c => c.id === f.category)?.name}`);
    if (f.department) parts.push(`department ${ref.departments.find(c => c.id === f.department)?.name}`);
    if (f.qse) parts.push(`QSE ${ref.qse.find(c => c.id === f.qse)?.code}`);
    if (f.priority) parts.push(`priority ${f.priority}`);
    if (f.overdue) parts.push('overdue');
    if (f.soon) parts.push('due soon');
    if (f.mine) parts.push('my actions');
    return parts.join(', ');
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sortBy = (k: SortKey) => set({ sort: k, dir: f.sort === k && f.dir === 'asc' ? 'desc' : 'asc' });
  const anyFilter = f.q || f.view !== 'all' || f.category || f.department || f.qse || f.priority || f.overdue || f.soon || f.mine;

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div><h1>Action register</h1><p className="muted">{total} action{total === 1 ? '' : 's'}{anyFilter ? ' match the filters' : ''}</p></div>
        <div className="row">
          <button className="btn" onClick={doExport} disabled={exporting || total === 0}>{exporting ? 'Exporting…' : 'Export to Excel'}</button>
          {canCreate && <Link className="btn btn-primary" to="/actions/new">New action</Link>}
        </div>
      </header>

      <div className="filters card">
        <input className="search" placeholder="Search ID, title, description, owner…" value={qInput} onChange={e => setQInput(e.target.value)} />
        <select value={f.view} onChange={e => set({ view: e.target.value === 'all' ? null : e.target.value })}>
          <option value="all">All statuses</option>
          <option value="open">Open (not closed/rejected)</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={f.category} onChange={e => set({ category: e.target.value || null })}>
          <option value="">All categories</option>
          {ref.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={f.department} onChange={e => set({ department: e.target.value || null })}>
          <option value="">All departments</option>
          {ref.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={f.qse} onChange={e => set({ qse: e.target.value || null })}>
          <option value="">All QSEs</option>
          {ref.qse.map(q => <option key={q.id} value={q.id}>{q.code} {q.name}</option>)}
        </select>
        <select value={f.priority} onChange={e => set({ priority: e.target.value || null })}>
          <option value="">All priorities</option>
          {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={f.overdue} onChange={e => set({ overdue: e.target.checked ? '1' : null })} /> Overdue</label>
        <label className="check"><input type="checkbox" checked={f.soon} onChange={e => set({ soon: e.target.checked ? '1' : null })} /> Due soon</label>
        <label className="check"><input type="checkbox" checked={f.mine} onChange={e => set({ mine: e.target.checked ? '1' : null })} /> Mine</label>
        {anyFilter && <button className="link-btn" onClick={() => { setQInput(''); setParams({}, { replace: true }); }}>Clear</button>}
      </div>

      <ErrorBox error={error} />
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <Empty title={anyFilter ? 'No actions match these filters' : 'No actions yet'}>
          {!anyFilter && canCreate && <Link to="/actions/new">Create the first action</Link>}
        </Empty>
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                {SORTABLE.map(c => (
                  <th key={c.key}>
                    <button className="th-sort" onClick={() => sortBy(c.key)}>
                      {c.label}{f.sort === c.key ? (f.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={r.is_overdue ? 'row-overdue' : ''}>
                  <td className="mono nowrap"><Link to={`/actions/${r.id}`}>{r.action_no}</Link></td>
                  <td className="cell-title"><Link to={`/actions/${r.id}`}>{r.title}</Link>
                    {r.qse_code && <div className="muted small">{r.qse_code}{r.iso_clauses ? ` · ISO ${r.iso_clauses}` : ''}</div>}</td>
                  <td>{r.category_name}</td>
                  <td>{r.department_code}</td>
                  <td><PriorityBadge p={r.priority} /></td>
                  <td><RiskBadge r={r.risk_level} score={r.risk_score} /></td>
                  <td className="nowrap">{r.owner_name}</td>
                  <td className="nowrap">
                    {fmtDate(r.due_date)}
                    {r.is_overdue && <div className="overdue small">{r.days_overdue} d overdue</div>}
                    {!r.is_overdue && r.is_due_soon && <div className="due-soon small">Due soon</div>}
                  </td>
                  <td><StatusBadge status={r.status} blocked={r.is_blocked} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="pager">
          <button className="btn btn-sm" disabled={f.page <= 1} onClick={() => set({ page: String(f.page - 1) }, false)}>‹ Previous</button>
          <span>Page {f.page} of {pages}</span>
          <button className="btn btn-sm" disabled={f.page >= pages} onClick={() => set({ page: String(f.page + 1) }, false)}>Next ›</button>
        </div>
      )}
    </div>
  );
}
