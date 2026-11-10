import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage, isConflict, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useRefData } from '../lib/refdata';
import { DECISION_LABEL, EVENT_META, fmtDate, fmtDateTime, STATUS_LABEL } from '../lib/format';
import type { AuditEvent, Comment, Decision, RegisterRow, WorkflowEvent } from '../lib/types';
import { ErrorBox, Field, Modal, PriorityBadge, RiskBadge, Spinner, StatusBadge, useToast } from '../components/ui';

const LIFECYCLE = ['draft', 'submitted', 'approved', 'in_progress', 'pending_verification', 'effectiveness_review', 'pending_closure', 'closed'] as const;

type Dialog =
  | { kind: 'event'; event: WorkflowEvent }
  | { kind: 'reassign' }
  | { kind: 'extend' }
  | null;

export default function ActionDetail() {
  const { id } = useParams();
  const { profile, has, managesDept } = useAuth();
  const ref = useRefData();
  const toast = useToast();
  const [a, setA] = useState<RegisterRow | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [tab, setTab] = useState<'details' | 'history' | 'comments' | 'audit'>('details');
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    const [r, ev, d, c] = await Promise.all([
      supabase.from('action_register_v').select('*').eq('id', id!).maybeSingle(),
      supabase.rpc('action_available_events', { p_action_id: id }),
      supabase.from('action_decisions').select('*').eq('action_id', id!).order('decided_at', { ascending: false }),
      supabase.from('action_comments').select('*').eq('action_id', id!).order('created_at'),
    ]);
    if (r.error) { setError(errorMessage(r.error)); return; }
    if (!r.data) { setNotFound(true); return; }
    setA(r.data as RegisterRow);
    setEvents((ev.data ?? []) as WorkflowEvent[]);
    setDecisions((d.data ?? []) as Decision[]);
    setComments((c.data ?? []) as Comment[]);
    setAudit(null);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== 'audit' || audit) return;
    supabase.from('audit_events').select('*').eq('action_id', id!).order('occurred_at', { ascending: false }).limit(500)
      .then(({ data, error }) => { if (error) setError(errorMessage(error)); else setAudit((data ?? []) as AuditEvent[]); });
  }, [tab, audit, id]);

  if (notFound) return <div className="page"><div className="alert alert-error">Action not found, or you do not have access to it.</div><Link to="/actions">Back to register</Link></div>;
  if (!a) return <div className="page"><ErrorBox error={error} />{!error && <Spinner />}</div>;

  const me = profile!.id;
  const isQM = has('quality_manager');
  const isDM = managesDept(a.department_id);
  const terminal = a.status === 'closed' || a.status === 'rejected';
  const canEdit = !terminal && (isQM || isDM || (a.status === 'draft' && (a.owner_id === me || a.created_by === me)) ||
    (['approved', 'in_progress'].includes(a.status) && a.owner_id === me));
  const canReassign = !terminal && (isQM || isDM);
  const canExtend = ['submitted', 'approved', 'in_progress', 'pending_verification', 'effectiveness_review'].includes(a.status)
    && (isQM || isDM) && a.owner_id !== me;
  const stepIndex = LIFECYCLE.indexOf(a.status as typeof LIFECYCLE[number]);

  return (
    <div className="page">
      <div className="crumbs"><Link to="/actions">Action register</Link> / <span className="mono">{a.action_no}</span></div>
      <header className="page-head detail-head">
        <div>
          <div className="row gap-s"><span className="mono big-id">{a.action_no}</span><StatusBadge status={a.status} blocked={a.is_blocked} /></div>
          <h1>{a.title}</h1>
          <div className="row gap-s wrap muted">
            <span>{a.category_name}</span>·<span>{a.department_name}</span>·<PriorityBadge p={a.priority} /><RiskBadge r={a.risk_level} score={a.risk_score} />
            {a.is_overdue && <span className="badge badge-overdue">{a.days_overdue} days overdue</span>}
            {!a.is_overdue && a.is_due_soon && <span className="badge badge-soon">Due soon</span>}
          </div>
        </div>
        <div className="row wrap">
          {canEdit && <Link className="btn" to={`/actions/${a.id}/edit`}>Edit</Link>}
          {canReassign && <button className="btn" onClick={() => setDialog({ kind: 'reassign' })}>Reassign</button>}
          {canExtend && <button className="btn" onClick={() => setDialog({ kind: 'extend' })}>Extend deadline</button>}
        </div>
      </header>

      {a.status !== 'rejected' && (
        <ol className="stepper">
          {LIFECYCLE.map((s, i) => {
            const skipped = (s === 'submitted' && a.requires_approval === false) || (s === 'effectiveness_review' && a.requires_effectiveness === false);
            return <li key={s} className={`${i < stepIndex ? 'done' : ''} ${i === stepIndex ? 'current' : ''} ${skipped ? 'skipped' : ''}`}>{STATUS_LABEL[s]}</li>;
          })}
        </ol>
      )}

      <section className="card workflow-panel">
        <div>
          <h2>Next step</h2>
          <p className="muted small">{nextStepText(a)}</p>
          {a.is_blocked && <div className="alert alert-warn">Blocked: {a.blocked_reason}</div>}
        </div>
        <div className="row wrap">
          {events.length === 0 && <span className="muted small">No workflow action available to you at this stage.</span>}
          {events.map(e => (
            <button key={e} className={`btn btn-${EVENT_META[e].tone}`} onClick={() => setDialog({ kind: 'event', event: e })}>{EVENT_META[e].label}</button>
          ))}
        </div>
      </section>

      <div className="tabs">
        {(['details', 'history', 'comments', 'audit'] as const).map(t => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {{ details: 'Details', history: `Decisions (${decisions.length})`, comments: `Comments (${comments.length})`, audit: 'Audit trail' }[t]}
          </button>
        ))}
      </div>

      {tab === 'details' && <Details a={a} name={ref.name} />}
      {tab === 'history' && <History decisions={decisions} name={ref.name} />}
      {tab === 'comments' && <Comments actionId={a.id} comments={comments} terminal={terminal} name={ref.name} onAdded={load} />}
      {tab === 'audit' && (audit ? <AuditTrail rows={audit} name={ref.name} /> : <Spinner />)}

      {dialog?.kind === 'event' && (
        <EventDialog a={a} event={dialog.event} minLen={ref.settings?.min_justification_len ?? 15}
          onClose={() => setDialog(null)} onDone={async msg => { setDialog(null); toast(msg); await load(); }} />
      )}
      {dialog?.kind === 'reassign' && (
        <ReassignDialog a={a} minLen={ref.settings?.min_justification_len ?? 15}
          onClose={() => setDialog(null)} onDone={async () => { setDialog(null); toast('Owner reassigned'); await load(); }} />
      )}
      {dialog?.kind === 'extend' && (
        <ExtendDialog a={a} minLen={ref.settings?.min_justification_len ?? 15}
          onClose={() => setDialog(null)} onDone={async () => { setDialog(null); toast('Deadline extended'); await load(); }} />
      )}
    </div>
  );
}

function nextStepText(a: RegisterRow): string {
  switch (a.status) {
    case 'draft': return 'Complete the description and measurable target, then submit. The approval policy is applied at submission.';
    case 'submitted': return 'Waiting for approval by a quality manager or the department manager (not the creator or owner).';
    case 'approved': return 'Approved for execution. The owner starts the work.';
    case 'in_progress': return 'The owner records the implementation summary, then submits for verification.';
    case 'pending_verification': return 'A reviewer or quality manager who did not perform the work verifies implementation.';
    case 'effectiveness_review': return a.effectiveness_review_date
      ? `Effectiveness to be evaluated on or after ${fmtDate(a.effectiveness_review_date)}. The action stays open until then.`
      : 'A reviewer evaluates whether the measurable target was achieved.';
    case 'pending_closure': return 'Verified' + (a.requires_effectiveness ? ' and effective' : '') + '. A quality manager authorizes formal closure.';
    case 'closed': return `Closed by ${a.closed_by_name ?? '—'} on ${fmtDateTime(a.closed_at)}. A quality manager can reopen it with justification.`;
    case 'rejected': return 'Rejected. This record is final and kept for traceability.';
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="kv"><dt>{label}</dt><dd>{children || <span className="muted">—</span>}</dd></div>;
}

function Details({ a, name }: { a: RegisterRow; name: (id: string | null) => string }) {
  return (
    <div className="detail-grid">
      <section className="card">
        <h3>Plan</h3>
        <dl>
          <Row label="Description"><p className="pre">{a.description}</p></Row>
          <Row label="Target outcome"><p className="pre">{a.target_outcome}</p></Row>
          <Row label="Effectiveness check"><p className="pre">{a.success_measure}</p></Row>
          <Row label="Source">{[a.source_name, a.source_reference].filter(Boolean).join(' · ')}</Row>
          <Row label="QSE">{a.qse_code && `${a.qse_code} · ${a.qse_name}`}</Row>
          <Row label="ISO 15189:2022">{a.iso_clauses}</Row>
        </dl>
      </section>
      <section className="card">
        <h3>Responsibility and dates</h3>
        <dl>
          <Row label="Action owner">{a.owner_name}</Row>
          <Row label="Assigned staff">{a.assigned_staff}</Row>
          <Row label="Created by">{`${a.created_by_name} · ${fmtDateTime(a.created_at)}`}</Row>
          <Row label="Start date">{a.start_date && fmtDate(a.start_date)}</Row>
          <Row label="Due date">{fmtDate(a.due_date)}{a.due_date !== a.original_due_date && <span className="muted"> (originally {fmtDate(a.original_due_date)})</span>}</Row>
          <Row label="Completion date">{a.completion_date && fmtDate(a.completion_date)}</Row>
          <Row label="Effectiveness review date">{a.effectiveness_review_date && fmtDate(a.effectiveness_review_date)}</Row>
          <Row label="Approval">{a.requires_approval == null ? 'Decided at submission' : a.requires_approval
            ? (a.approved_by ? `Approved by ${name(a.approved_by)} · ${fmtDateTime(a.approved_at)}` : 'Required') : 'Not required by policy'}</Row>
        </dl>
      </section>
      <section className="card span-2">
        <h3>Implementation, verification and closure</h3>
        <dl>
          <Row label="Implementation summary"><p className="pre">{a.implementation_summary}</p></Row>
          <Row label="Verification result">{a.verification_result && <><p className="pre">{a.verification_result}</p><span className="muted small">{name(a.verified_by)} · {fmtDateTime(a.verified_at)}</span></>}</Row>
          <Row label="Effectiveness result">{a.requires_effectiveness === false ? <span className="muted">Not required for this category</span> :
            a.effectiveness_result && <><p className="pre">{a.effectiveness_result}</p><span className="muted small">{name(a.effectiveness_by)} · {fmtDateTime(a.effectiveness_at)}</span></>}</Row>
          <Row label="Closure authorization">{a.closed_at && <>{a.closed_by_name} · {fmtDateTime(a.closed_at)}{a.closure_comment && <p className="pre">{a.closure_comment}</p>}</>}</Row>
          {a.reopened_count > 0 && <Row label="Reopened">{a.reopened_count} time(s)</Row>}
        </dl>
        <p className="muted small">Evidence file uploads, tasks with progress, and CAPA root-cause analysis arrive in Phase 2.</p>
      </section>
    </div>
  );
}

function History({ decisions, name }: { decisions: Decision[]; name: (id: string | null) => string }) {
  if (!decisions.length) return <div className="card"><p className="muted">No decisions recorded yet.</p></div>;
  return (
    <div className="card">
      <ul className="timeline">
        {decisions.map(d => (
          <li key={d.id}>
            <div className="tl-head">
              <b>{DECISION_LABEL[d.event] ?? d.event}</b>
              {d.from_status !== d.to_status && <span className="muted"> · {STATUS_LABEL[d.from_status]} → {STATUS_LABEL[d.to_status]}</span>}
            </div>
            <div className="muted small">{name(d.decided_by)} · {fmtDateTime(d.decided_at)}</div>
            {d.details && d.event === 'extend_deadline' && <div className="small">Due date {fmtDate(String(d.details.old_due_date))} → {fmtDate(String(d.details.new_due_date))}</div>}
            {d.details && d.event === 'reassign' && <div className="small">New owner: {name(String(d.details.new_owner))}</div>}
            {d.comment && <p className="pre">{d.comment}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Comments({ actionId, comments, terminal, name, onAdded }: {
  actionId: string; comments: Comment[]; terminal: boolean; name: (id: string | null) => string; onAdded: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add() {
    if (!body.trim()) return;
    setBusy(true); setError(null);
    const { error } = await supabase.from('action_comments').insert({ action_id: actionId, author_id: profile!.id, body: body.trim() });
    setBusy(false);
    if (error) setError(errorMessage(error)); else { setBody(''); await onAdded(); }
  }
  return (
    <div className="card">
      {comments.length === 0 && <p className="muted">No comments yet.</p>}
      <ul className="comments">
        {comments.map(c => (
          <li key={c.id}><div className="muted small">{name(c.author_id)} · {fmtDateTime(c.created_at)}</div><p className="pre">{c.body}</p></li>
        ))}
      </ul>
      {!terminal && (
        <div className="stack">
          <ErrorBox error={error} />
          <textarea rows={3} placeholder="Add a progress note or question. Comments cannot be edited or deleted." value={body} onChange={e => setBody(e.target.value)} maxLength={4000} />
          <div><button className="btn btn-primary" onClick={add} disabled={busy || !body.trim()}>{busy ? 'Posting…' : 'Post comment'}</button></div>
        </div>
      )}
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  status: 'Status', owner_id: 'Owner', due_date: 'Due date', title: 'Title', description: 'Description', priority: 'Priority',
  likelihood: 'Likelihood', severity: 'Severity', category_id: 'Category', department_id: 'Department', target_outcome: 'Target outcome',
  implementation_summary: 'Implementation summary', verification_result: 'Verification result', effectiveness_result: 'Effectiveness result',
  is_blocked: 'Blocked', blocked_reason: 'Blocked reason', start_date: 'Start date', completion_date: 'Completion date',
  closure_comment: 'Closure comment', success_measure: 'Effectiveness check', qse_id: 'QSE', source_id: 'Source', source_reference: 'Source reference',
  effectiveness_review_date: 'Effectiveness review date',
};
const HIDDEN_FIELDS = new Set(['risk_score', 'risk_level', 'version', 'updated_at']);

function AuditTrail({ rows, name }: { rows: AuditEvent[]; name: (id: string | null) => string }) {
  const show = (v: unknown, field: string) => {
    if (v == null || v === '') return '∅';
    if (field.endsWith('_id') || field.endsWith('_by')) return name(String(v));
    if (field === 'status') return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? String(v);
    const s = String(v);
    return s.length > 140 ? s.slice(0, 140) + '…' : s;
  };
  const what = (r: AuditEvent) => {
    const t = { action_plans: 'Action', action_assignments: 'Staff assignment', action_iso_clauses: 'ISO clause link',
      action_decisions: 'Decision record', deadline_extensions: 'Deadline extension', action_comments: 'Comment' }[r.table_name] ?? r.table_name;
    const op = { INSERT: 'created', UPDATE: 'updated', DELETE: 'removed' }[r.operation];
    return `${t} ${op}`;
  };
  return (
    <div className="card">
      <p className="muted small">Append-only record written by the database. It cannot be edited or deleted by any user, including administrators.</p>
      <div className="table-wrap">
        <table className="table audit">
          <thead><tr><th>When (ICT)</th><th>Who</th><th>What</th><th>Changes</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="nowrap">{fmtDateTime(r.occurred_at)}</td>
                <td className="nowrap">{r.actor_id ? name(r.actor_id) : <span className="muted">System ({r.db_role})</span>}</td>
                <td>{what(r)}{r.event_type && <div><span className="badge">{DECISION_LABEL[r.event_type] ?? r.event_type}</span></div>}</td>
                <td>
                  {r.operation === 'UPDATE' && r.changed_fields?.filter(f => !HIDDEN_FIELDS.has(f)).map(f => (
                    <div key={f} className="small"><b>{FIELD_LABEL[f] ?? f}:</b> {show(r.old_data?.[f], f)} → {show(r.new_data?.[f], f)}</div>
                  ))}
                  {r.operation !== 'UPDATE' && r.table_name === 'action_assignments' && <span className="small">{name(String((r.new_data ?? r.old_data)?.user_id))}</span>}
                  {r.operation !== 'UPDATE' && r.table_name === 'action_decisions' && <span className="small">{String(r.new_data?.comment ?? '')}</span>}
                  {r.operation !== 'UPDATE' && r.table_name === 'action_comments' && <span className="small">{show(r.new_data?.body, 'body')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- dialogs ----------------
function EventDialog({ a, event, minLen, onClose, onDone }: {
  a: RegisterRow; event: WorkflowEvent; minLen: number; onClose: () => void; onDone: (msg: string) => Promise<void>;
}) {
  const meta = EVENT_META[event];
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = meta.commentRequired && comment.trim().length < minLen;
  async function go() {
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('action_transition', {
      p_action_id: a.id, p_event: event, p_comment: comment.trim() || null, p_expected_version: a.version,
    });
    setBusy(false);
    if (error) { setError(isConflict(error) ? 'Someone else changed this action while you were looking at it. Close this dialog; the page will reload.' : errorMessage(error)); return; }
    const to = (data as { status: keyof typeof STATUS_LABEL }).status;
    await onDone(`${meta.label}: ${a.action_no} is now ${STATUS_LABEL[to]}`);
  }
  return (
    <Modal title={`${meta.label} — ${a.action_no}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className={`btn btn-${meta.tone}`} onClick={go} disabled={busy || tooShort}>{busy ? 'Saving…' : meta.label}</button></>}>
      <p>{meta.help}</p>
      <ErrorBox error={error} />
      <Field label={meta.commentLabel} required={meta.commentRequired} hint={meta.commentRequired ? `At least ${minLen} characters. Recorded permanently with your name and the time.` : 'Recorded permanently with your name and the time.'}>
        <textarea rows={4} value={comment} onChange={e => setComment(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}

function ReassignDialog({ a, minLen, onClose, onDone }: { a: RegisterRow; minLen: number; onClose: () => void; onDone: () => Promise<void> }) {
  const ref = useRefData();
  const [owner, setOwner] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('action_reassign', { p_action_id: a.id, p_new_owner: owner, p_justification: why.trim(), p_expected_version: a.version });
    setBusy(false);
    if (error) setError(errorMessage(error)); else await onDone();
  }
  return (
    <Modal title={`Reassign owner — ${a.action_no}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={go} disabled={busy || !owner || why.trim().length < minLen}>{busy ? 'Saving…' : 'Reassign'}</button></>}>
      <p>Current owner: <b>{a.owner_name}</b></p>
      <ErrorBox error={error} />
      <Field label="New owner" required>
        <select value={owner} onChange={e => setOwner(e.target.value)}>
          <option value="">Select…</option>
          {ref.eligibleOwners.filter(p => p.id !== a.owner_id).map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
        </select>
      </Field>
      <Field label="Justification" required hint={`At least ${minLen} characters`}>
        <textarea rows={3} value={why} onChange={e => setWhy(e.target.value)} />
      </Field>
    </Modal>
  );
}

function ExtendDialog({ a, minLen, onClose, onDone }: { a: RegisterRow; minLen: number; onClose: () => void; onDone: () => Promise<void> }) {
  const [due, setDue] = useState(a.due_date);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc('action_extend_deadline', { p_action_id: a.id, p_new_due: due, p_justification: why.trim(), p_expected_version: a.version });
    setBusy(false);
    if (error) setError(errorMessage(error)); else await onDone();
  }
  return (
    <Modal title={`Extend deadline — ${a.action_no}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={go} disabled={busy || !due || due === a.due_date || why.trim().length < minLen}>{busy ? 'Saving…' : 'Extend deadline'}</button></>}>
      <p>Current due date: <b>{fmtDate(a.due_date)}</b>{a.due_date !== a.original_due_date && <> (original {fmtDate(a.original_due_date)})</>}</p>
      <ErrorBox error={error} />
      <Field label="New due date" required><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
      <Field label="Justification" required hint={`At least ${minLen} characters. The original due date is kept for reporting.`}>
        <textarea rows={3} value={why} onChange={e => setWhy(e.target.value)} />
      </Field>
    </Modal>
  );
}
