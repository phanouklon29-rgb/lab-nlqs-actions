import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useRefData } from '../lib/refdata';
import { PRIORITY_LABEL, RISK_LABEL, riskLevel, STATUS_LABEL } from '../lib/format';
import type { ActionPlan, Priority } from '../lib/types';
import { ErrorBox, Field, RiskBadge, Spinner, useToast } from '../components/ui';

interface FormState {
  title: string; description: string; category_id: string; source_id: string; source_reference: string;
  qse_id: string; department_id: string; priority: Priority; likelihood: number; severity: number;
  owner_id: string; start_date: string; due_date: string; target_outcome: string; success_measure: string;
  effectiveness_review_date: string; implementation_summary: string;
}

const EMPTY: FormState = {
  title: '', description: '', category_id: '', source_id: '', source_reference: '', qse_id: '', department_id: '',
  priority: 'medium', likelihood: 1, severity: 1, owner_id: '', start_date: '', due_date: '', target_outcome: '',
  success_measure: '', effectiveness_review_date: '', implementation_summary: '',
};

export default function ActionForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const nav = useNavigate();
  const toast = useToast();
  const { profile, has, managesDept, roles } = useAuth();
  const ref = useRefData();
  const [action, setAction] = useState<ActionPlan | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [clauses, setClauses] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [origClauses, setOrigClauses] = useState<string[]>([]);
  const [origAssignees, setOrigAssignees] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clauseFilter, setClauseFilter] = useState('');

  useEffect(() => {
    if (!isEdit) {
      setForm(f => ({ ...f, department_id: profile?.department_id ?? '', owner_id: profile?.id ?? '' }));
      return;
    }
    (async () => {
      const [a, c, s] = await Promise.all([
        supabase.from('action_plans').select('*').eq('id', id!).maybeSingle(),
        supabase.from('action_iso_clauses').select('clause_id').eq('action_id', id!),
        supabase.from('action_assignments').select('user_id').eq('action_id', id!),
      ]);
      if (a.error || !a.data) { setError(a.error ? errorMessage(a.error) : 'Action not found or not visible to you.'); setLoading(false); return; }
      const x = a.data as ActionPlan;
      setAction(x);
      setForm({
        title: x.title, description: x.description, category_id: x.category_id, source_id: x.source_id ?? '',
        source_reference: x.source_reference ?? '', qse_id: x.qse_id ?? '', department_id: x.department_id,
        priority: x.priority, likelihood: x.likelihood, severity: x.severity, owner_id: x.owner_id,
        start_date: x.start_date ?? '', due_date: x.due_date, target_outcome: x.target_outcome,
        success_measure: x.success_measure ?? '', effectiveness_review_date: x.effectiveness_review_date ?? '',
        implementation_summary: x.implementation_summary ?? '',
      });
      const cl = (c.data ?? []).map(r => r.clause_id as string); setClauses(cl); setOrigClauses(cl);
      const as = (s.data ?? []).map(r => r.user_id as string); setAssignees(as); setOrigAssignees(as);
      setLoading(false);
    })();
  }, [id, isEdit, profile]);

  // ---- what this user may change (mirrors database guard; the database remains the authority) ----
  const perm = useMemo(() => {
    const isQM = has('quality_manager');
    const status = action?.status ?? 'draft';
    const isDM = action ? managesDept(action.department_id) : false;
    const isOwner = action?.owner_id === profile?.id;
    const isCreator = action?.created_by === profile?.id;
    const draft = status === 'draft';
    const terminal = status === 'closed' || status === 'rejected';
    const canEditAny = !isEdit || (!terminal && (isQM || isDM || (draft && (isOwner || isCreator)) || (['approved', 'in_progress'].includes(status) && isOwner)));
    const manager = isQM || isDM;
    return {
      canEditAny, draft, terminal, status,
      general: canEditAny && (draft || manager),
      policy: canEditAny && (draft || isQM),
      ownerDue: canEditAny && draft,
      implementation: canEditAny && !draft,
      clauses: canEditAny && (draft || manager),
      assignees: !terminal && (!isEdit || isQM || isDM || isOwner || (draft && isCreator)),
    };
  }, [action, isEdit, has, managesDept, profile]);

  const deptOptions = useMemo(() => {
    if (has('quality_manager') || has('action_owner') || isEdit) return ref.departments.filter(d => d.active || d.id === form.department_id);
    const managed = new Set(roles.filter(r => r.role === 'department_manager').map(r => r.department_id));
    return ref.departments.filter(d => d.active && managed.has(d.id));
  }, [ref.departments, roles, has, isEdit, form.department_id]);

  const category = ref.categories.find(c => c.id === form.category_id);
  const risk = riskLevel(form.likelihood, form.severity);
  const approvalPreview = useMemo(() => {
    const s = ref.settings;
    if (!category) return null;
    const pr: Priority[] = ['low', 'medium', 'high', 'critical'];
    const rk = ['low', 'medium', 'high', 'very_high'];
    const reasons: string[] = [];
    if (category.requires_approval) reasons.push(`category "${category.name}"`);
    if (s?.approval_min_priority && pr.indexOf(form.priority) >= pr.indexOf(s.approval_min_priority)) reasons.push(`priority ${PRIORITY_LABEL[form.priority]}`);
    if (s?.approval_min_risk && rk.indexOf(risk) >= rk.indexOf(s.approval_min_risk)) reasons.push(`risk ${RISK_LABEL[risk]}`);
    return reasons;
  }, [category, form.priority, risk, ref.settings]);

  const up = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.title.trim().length < 5) return setError('Title must be at least 5 characters.');
    if (!form.category_id || !form.department_id || !form.owner_id || !form.due_date) return setError('Category, department, owner and due date are required.');
    if (form.start_date && form.due_date < form.start_date) return setError('Due date cannot be before the start date.');
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      const put = (k: keyof FormState, nullable = true) => { payload[k] = nullable && form[k] === '' ? null : form[k]; };
      if (perm.general) { put('title', false); put('description', false); put('source_id'); put('source_reference'); put('qse_id'); put('target_outcome', false); put('success_measure'); }
      if (perm.policy) { put('category_id', false); put('department_id', false); put('priority', false); put('likelihood', false); put('severity', false); }
      if (perm.ownerDue) { put('owner_id', false); put('due_date', false); }
      if (perm.general || perm.implementation) { put('start_date'); put('effectiveness_review_date'); }
      if (perm.implementation) put('implementation_summary');

      let actionId = id;
      if (!isEdit) {
        const { data, error } = await supabase.from('action_plans').insert(payload).select('id, action_no').single();
        if (error) throw error;
        actionId = data.id;
        toast(`${data.action_no} created as draft`);
      } else {
        if (action) {
          // drop unchanged keys so the guard only sees real edits
          for (const k of Object.keys(payload)) {
            const cur = (action as unknown as Record<string, unknown>)[k] ?? null;
            if (String(cur ?? '') === String(payload[k] ?? '')) delete payload[k];
          }
        }
        if (Object.keys(payload).length) {
          const { data, error } = await supabase.from('action_plans').update(payload)
            .eq('id', id!).eq('version', action!.version).select('id');
          if (error) throw error;
          if (!data?.length) throw new Error('This action was changed by someone else while you were editing (or you no longer have permission). Reload the page to see the latest version.');
        }
      }
      const same = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
      if (perm.clauses && !same(clauses, origClauses)) {
        const { error } = await supabase.rpc('action_set_iso_clauses', { p_action_id: actionId, p_clause_ids: clauses });
        if (error) throw error;
      }
      if (perm.assignees && !same(assignees, origAssignees)) {
        const { error } = await supabase.rpc('action_set_assignees', { p_action_id: actionId, p_user_ids: assignees });
        if (error) throw error;
      }
      if (isEdit) toast('Changes saved');
      nav(`/actions/${actionId}`);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  if (loading || !ref.loaded) return <div className="page"><Spinner /></div>;
  if (isEdit && !action) return <div className="page"><ErrorBox error={error} /></div>;
  if (isEdit && !perm.canEditAny) {
    return <div className="page"><div className="alert alert-error">You cannot edit this action in its current status ({STATUS_LABEL[perm.status]}).</div>
      <Link to={`/actions/${id}`}>Back to action</Link></div>;
  }

  const staffOptions = ref.profiles.filter(p => p.active);
  const clauseList = ref.clauses.filter(c => (c.active || clauses.includes(c.id)) &&
    (`${c.clause} ${c.title}`).toLowerCase().includes(clauseFilter.toLowerCase()));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{isEdit ? `Edit ${action!.action_no}` : 'New action'}</h1>
          <p className="muted">{isEdit ? `Status: ${STATUS_LABEL[perm.status]}` : 'Saved as Draft. Submit it from the action page when ready.'}</p>
        </div>
      </header>
      {isEdit && !perm.draft && (
        <div className="alert alert-info">
          This action has been submitted, so some fields are locked. Change the owner with <b>Reassign</b> or the due date with
          <b> Extend deadline</b> on the action page (a justification is recorded).
          {!perm.general && ' As action owner you can update implementation details only.'}
        </div>
      )}
      <form className="card form-grid" onSubmit={submit}>
        <ErrorBox error={error} />
        <h3 className="form-section">What and why</h3>
        <Field label="Action title" required wide>
          <input value={form.title} onChange={e => up('title', e.target.value)} disabled={!perm.general} maxLength={200} required />
        </Field>
        <Field label="Description" hint="Problem or opportunity, and the planned action. Needed (10+ characters) before submission." wide>
          <textarea rows={4} value={form.description} onChange={e => up('description', e.target.value)} disabled={!perm.general} />
        </Field>
        <Field label="Category" required>
          <select value={form.category_id} onChange={e => up('category_id', e.target.value)} disabled={!perm.policy} required>
            <option value="">Select…</option>
            {ref.categories.filter(c => c.active || c.id === form.category_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select value={form.source_id} onChange={e => up('source_id', e.target.value)} disabled={!perm.general}>
            <option value="">—</option>
            {ref.sources.filter(c => c.active || c.id === form.source_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Source reference" hint="e.g. audit finding IA-2026-03-F2, NC report no.">
          <input value={form.source_reference} onChange={e => up('source_reference', e.target.value)} disabled={!perm.general} />
        </Field>
        <Field label="Quality System Essential">
          <select value={form.qse_id} onChange={e => up('qse_id', e.target.value)} disabled={!perm.general}>
            <option value="">—</option>
            {ref.qse.filter(c => c.active || c.id === form.qse_id).map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </Field>
        <div className="field field-wide">
          <span className="field-label">ISO 15189:2022 clauses {clauses.length > 0 && <span className="muted">({clauses.length} selected)</span>}</span>
          {perm.clauses && <input className="clause-search" placeholder="Filter clauses…" value={clauseFilter} onChange={e => setClauseFilter(e.target.value)} />}
          <div className={`chip-list ${!perm.clauses ? 'disabled' : ''}`}>
            {clauseList.map(c => (
              <label key={c.id} className={`chip ${clauses.includes(c.id) ? 'chip-on' : ''}`} title={c.title}>
                <input type="checkbox" checked={clauses.includes(c.id)} disabled={!perm.clauses} onChange={() => toggle(clauses, setClauses, c.id)} />
                <b>{c.clause}</b> {c.title}
              </label>
            ))}
          </div>
        </div>

        <h3 className="form-section">Priority and risk</h3>
        <Field label="Department" required>
          <select value={form.department_id} onChange={e => up('department_id', e.target.value)} disabled={!perm.policy} required>
            <option value="">Select…</option>
            {deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Priority" required>
          <select value={form.priority} onChange={e => up('priority', e.target.value as Priority)} disabled={!perm.policy}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Likelihood (1–5)" hint="1 rare · 5 almost certain">
          <select value={form.likelihood} onChange={e => up('likelihood', Number(e.target.value))} disabled={!perm.policy}>
            {[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Severity (1–5)" hint="1 negligible · 5 patient harm">
          <select value={form.severity} onChange={e => up('severity', Number(e.target.value))} disabled={!perm.policy}>
            {[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}
          </select>
        </Field>
        <div className="field field-wide risk-preview">
          <span>Risk: <RiskBadge r={risk} score={form.likelihood * form.severity} /></span>
          {approvalPreview && (
            <span className="muted">
              {approvalPreview.length ? `Approval will be required (${approvalPreview.join(', ')}).` : 'Approval not required by current policy.'}
              {category && ` Effectiveness review: ${category.requires_effectiveness ? 'required' : 'not required'}.`}
            </span>
          )}
        </div>

        <h3 className="form-section">People and dates</h3>
        <Field label="Action owner" required hint="Accountable person (must hold Action Owner, Department Manager or Quality Manager role)">
          <select value={form.owner_id} onChange={e => up('owner_id', e.target.value)} disabled={!perm.ownerDue} required>
            <option value="">Select…</option>
            {ref.eligibleOwners.concat(ref.eligibleOwners.some(p => p.id === form.owner_id) ? [] : ref.profiles.filter(p => p.id === form.owner_id))
              .map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" value={form.start_date} onChange={e => up('start_date', e.target.value)} disabled={!(perm.general || perm.implementation)} />
        </Field>
        <Field label="Due date" required>
          <input type="date" value={form.due_date} onChange={e => up('due_date', e.target.value)} disabled={!perm.ownerDue} required />
        </Field>
        <div className="field field-wide">
          <span className="field-label">Assigned staff {assignees.length > 0 && <span className="muted">({assignees.length})</span>}</span>
          <div className={`chip-list ${!perm.assignees ? 'disabled' : ''}`}>
            {staffOptions.map(p => (
              <label key={p.id} className={`chip ${assignees.includes(p.id) ? 'chip-on' : ''}`}>
                <input type="checkbox" checked={assignees.includes(p.id)} disabled={!perm.assignees} onChange={() => toggle(assignees, setAssignees, p.id)} />
                {p.full_name || p.email}
              </label>
            ))}
          </div>
        </div>

        <h3 className="form-section">Targets</h3>
        <Field label="Measurable target outcome" required wide hint="What will be true when the action has worked, e.g. “Zero haemolysed potassium rejections for 3 months”.">
          <textarea rows={2} value={form.target_outcome} onChange={e => up('target_outcome', e.target.value)} disabled={!perm.general} />
        </Field>
        <Field label="How effectiveness will be checked" wide hint="Data source, period and acceptance criterion">
          <textarea rows={2} value={form.success_measure} onChange={e => up('success_measure', e.target.value)} disabled={!perm.general} />
        </Field>
        <Field label="Effectiveness review date" hint="When enough data will exist to judge effectiveness">
          <input type="date" value={form.effectiveness_review_date} onChange={e => up('effectiveness_review_date', e.target.value)} disabled={!(perm.general || perm.implementation)} />
        </Field>
        {isEdit && !perm.draft && (
          <Field label="Implementation summary" wide hint="What was done and where the evidence is filed. Required before submitting for verification.">
            <textarea rows={4} value={form.implementation_summary} onChange={e => up('implementation_summary', e.target.value)} disabled={!perm.implementation} />
          </Field>
        )}
        <div className="form-actions field-wide">
          <Link className="btn btn-ghost" to={isEdit ? `/actions/${id}` : '/actions'}>Cancel</Link>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create draft'}</button>
        </div>
      </form>
    </div>
  );
}
