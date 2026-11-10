import { useEffect, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useRefData } from '../../lib/refdata';
import { PRIORITY_LABEL, RISK_LABEL } from '../../lib/format';
import type { Priority, RiskLevel, Settings } from '../../lib/types';
import { ErrorBox, Field, Spinner, useToast } from '../../components/ui';

export default function PolicyAdmin() {
  const { has } = useAuth();
  const ref = useRefData();
  const toast = useToast();
  const canEdit = has('quality_manager');
  const [s, setS] = useState<Settings | null>(ref.settings);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setS(ref.settings); }, [ref.settings]);
  if (!s) return <div className="page"><Spinner /></div>;

  async function save() {
    setError(null);
    const { data, error } = await supabase.from('action_settings').update({
      approval_min_priority: s!.approval_min_priority, approval_min_risk: s!.approval_min_risk,
      due_soon_days: s!.due_soon_days, min_justification_len: s!.min_justification_len,
    }).eq('id', true).select('id');
    if (error) setError(errorMessage(error));
    else if (!data?.length) setError('Only a quality manager can change the approval policy.');
    else { toast('Policy saved'); await ref.reload(); }
  }

  return (
    <div className="page">
      <header className="page-head"><div><h1>Approval policy</h1>
        <p className="muted">How the system decides whether an action needs approval before execution.</p></div></header>
      {!canEdit && <div className="alert alert-info">Read-only. Only a quality manager can change laboratory policy.</div>}
      <ErrorBox error={error} />
      <section className="card stack">
        <p>An action requires approval when <b>any</b> of these is true at submission:</p>
        <ol className="policy-list">
          <li>its category is marked “always needs approval” (Reference lists → Action categories), or</li>
          <li>its priority is at or above the threshold below, or</li>
          <li>its risk level (likelihood × severity) is at or above the threshold below.</li>
        </ol>
        <div className="form-grid">
          <Field label="Priority threshold">
            <select disabled={!canEdit} value={s.approval_min_priority ?? ''} onChange={e => setS({ ...s, approval_min_priority: (e.target.value || null) as Priority | null })}>
              <option value="">Never (priority does not trigger approval)</option>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v} or higher</option>)}
            </select>
          </Field>
          <Field label="Risk threshold" hint="Low 1–4 · Medium 5–9 · High 10–19 · Very high 20–25">
            <select disabled={!canEdit} value={s.approval_min_risk ?? ''} onChange={e => setS({ ...s, approval_min_risk: (e.target.value || null) as RiskLevel | null })}>
              <option value="">Never (risk does not trigger approval)</option>
              {Object.entries(RISK_LABEL).map(([k, v]) => <option key={k} value={k}>{v} or higher</option>)}
            </select>
          </Field>
          <Field label="“Due soon” window (days)">
            <input type="number" min={1} max={90} disabled={!canEdit} value={s.due_soon_days} onChange={e => setS({ ...s, due_soon_days: Number(e.target.value) })} />
          </Field>
          <Field label="Minimum justification length (characters)" hint="Applies to rejections, returns, verification results, reopening, reassignment and extensions">
            <input type="number" min={5} max={500} disabled={!canEdit} value={s.min_justification_len} onChange={e => setS({ ...s, min_justification_len: Number(e.target.value) })} />
          </Field>
          <Field label="Laboratory time zone" hint="Used for “today”, overdue and due-soon calculations">
            <input value={s.timezone} disabled />
          </Field>
        </div>
        {canEdit && <div><button className="btn btn-primary" onClick={save}>Save policy</button></div>}
      </section>
      <section className="card">
        <h3>Segregation of duties (fixed rules)</h3>
        <ul className="policy-list">
          <li>Approval: quality manager or the department’s manager — never the action’s creator or owner.</li>
          <li>Verification: reviewer or quality manager — never the owner, assigned staff, or the person who submitted it for verification.</li>
          <li>Effectiveness review: reviewer or quality manager — never the owner or assigned staff.</li>
          <li>Closure and reopening: quality manager only; the owner cannot close their own action.</li>
          <li>Deadline extension and reassignment: quality manager or department manager, with recorded justification; the owner cannot extend their own deadline.</li>
          <li>Administrators manage users and lists but have no approval authority unless separately granted a quality role — and cannot grant roles to themselves.</li>
        </ul>
      </section>
    </div>
  );
}
