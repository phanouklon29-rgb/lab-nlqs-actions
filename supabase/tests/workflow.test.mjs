// Automated database tests for LAB NLQS Action Plan Control — Phase 1.
// Runs the real migrations on embedded PostgreSQL (PGlite) with a Supabase auth stub,
// then exercises permissions, workflow, segregation of duties and audit integrity
// exactly as the app's signed-in users would (role "authenticated" + JWT subject).
//
//   cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', 'migrations');
const db = new PGlite();

const U = {
  admin:    '00000000-0000-0000-0000-00000000000a',
  qm:       '00000000-0000-0000-0000-0000000000b1',
  dm:       '00000000-0000-0000-0000-0000000000c1',
  dmOther:  '00000000-0000-0000-0000-0000000000c2',
  owner:    '00000000-0000-0000-0000-0000000000d1',
  owner2:   '00000000-0000-0000-0000-0000000000d2',
  staff:    '00000000-0000-0000-0000-0000000000e1',
  reviewer: '00000000-0000-0000-0000-0000000000f1',
  viewer:   '00000000-0000-0000-0000-000000000011',
  outsider: '00000000-0000-0000-0000-000000000012',
};

// ---------- helpers ----------
async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}
async function asSuper(sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  return db.query(sql, params);
}
async function fails(promise, pattern) {
  try { await promise; } catch (e) {
    if (pattern && !new RegExp(pattern, 'i').test(e.message)) throw new Error(`Failed with unexpected error: ${e.message}`);
    return e.message;
  }
  throw new Error('Expected failure but statement succeeded');
}
// Passes if the statement errors OR affects no rows (both mean "not permitted").
async function blocked(promise) {
  try { const r = await promise; if (r.rows.length === 0) return; } catch { return; }
  throw new Error('Expected the change to be blocked but it succeeded');
}
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg ?? 'Mismatch'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const results = [];
async function test(id, name, fn) {
  try { await fn(); results.push({ id, name, ok: true }); console.log(`PASS ${id} ${name}`); }
  catch (e) { results.push({ id, name, ok: false, err: e.message }); console.log(`FAIL ${id} ${name}\n     ${e.message}`); }
}
const one = r => r.rows[0];
const tr = (user, id, ev, comment = null, ver = null) =>
  as(user, 'select * from public.action_transition($1,$2,$3,$4)', [id, ev, comment, ver]).then(one);
const lookup = async (table, code) => one(await asSuper(`select id from public.${table} where code=$1`, [code])).id;
const COMMENT = 'Documented reason for this decision.';

// ---------- setup ----------
await db.exec(readFileSync(join(here, 'supabase_stub.sql'), 'utf8'));
for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
  console.log(`migration applied: ${f}`);
}
// Re-running migrations must be safe (idempotent, non-destructive)
for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
}
console.log('migrations re-applied without error (idempotent)');

for (const [k, id] of Object.entries(U))
  await asSuper(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, `${k}@lab.test`, { full_name: k.toUpperCase() }]);
await asSuper(`insert into public.departments (code,name) values ('HEM','Haematology'),('CHEM','Clinical Chemistry')`);
const HEM = await lookup('departments', 'HEM');
const CHEM = await lookup('departments', 'CHEM');
// bootstrap first administrator (as in README)
await asSuper(`insert into public.user_roles (user_id, role) values ($1,'administrator')`, [U.admin]);

const CORR = await lookup('action_categories', 'CORRECTIVE');
const ROUT = await lookup('action_categories', 'ROUTINE');
const IMPR = await lookup('action_categories', 'IMPROVEMENT');
const QSE10 = await lookup('qse_categories', 'QSE10');

const newAction = (user, over = {}) => as(user,
  `insert into public.action_plans (title, description, category_id, department_id, owner_id, due_date, target_outcome, priority, likelihood, severity, qse_id)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
  [over.title ?? 'Recalibrate haematology analyzer', over.description ?? 'Calibration drift detected on XN-330 during IQC review.',
   over.category ?? CORR, over.department ?? HEM, over.owner ?? U.owner, over.due ?? '2099-12-31',
   over.target ?? 'Zero IQC 1-3s rejections for 30 days', over.priority ?? 'medium', over.likelihood ?? 2, over.severity ?? 2, QSE10]).then(one);

// ---------- tests ----------
await test('T01', 'Anonymous users cannot read anything', async () => {
  await fails(as(null, 'select * from public.action_plans'), 'permission denied');
  await fails(as(null, 'select * from public.profiles'), 'permission denied');
});

await test('T02', 'Administrator grants roles to others but cannot change own roles', async () => {
  const grants = [[U.qm,'quality_manager',null],[U.dm,'department_manager',HEM],[U.dmOther,'department_manager',CHEM],
    [U.owner,'action_owner',null],[U.owner2,'action_owner',null],[U.staff,'assigned_staff',null],
    [U.reviewer,'reviewer',null],[U.viewer,'viewer',null],[U.outsider,'assigned_staff',null]];
  for (const [u, r, d] of grants)
    await as(U.admin, 'insert into public.user_roles (user_id, role, department_id) values ($1,$2,$3)', [u, r, d]);
  await fails(as(U.admin, `insert into public.user_roles (user_id, role) values ($1,'quality_manager')`, [U.admin]), 'own roles');
  await fails(as(U.qm, `insert into public.user_roles (user_id, role) values ($1,'reviewer')`, [U.staff]), 'row-level security');
});

await test('T03', 'Department manager role must be scoped to a department', async () => {
  await fails(as(U.admin, `insert into public.user_roles (user_id, role) values ($1,'department_manager')`, [U.staff]), 'user_roles_scope_chk');
});

await test('T04', 'Non-admin can edit own name but not own department or active flag', async () => {
  await as(U.staff, `update public.profiles set full_name='Staff One' where id=$1`, [U.staff]);
  await fails(as(U.staff, `update public.profiles set department_id=$2 where id=$1`, [U.staff, HEM]), 'administrator');
  const r = await as(U.staff, `update public.profiles set full_name='x' where id=$1 returning id`, [U.owner]);
  eq(r.rows.length, 0, 'should not update another profile');
});

let A; // main corrective action
await test('T05', 'Action owner creates an action; system forces draft status and numbering', async () => {
  A = await newAction(U.owner);
  eq(A.status, 'draft'); eq(A.created_by, U.owner);
  if (!/^ACT-\d{4}-0001$/.test(A.action_no)) throw new Error('bad action number ' + A.action_no);
  const sneaky = await as(U.owner, `insert into public.action_plans (title, category_id, department_id, owner_id, due_date, status, closed_at)
     values ('Sneaky closed action', $1, $2, $3, '2099-01-01', 'closed', now()) returning status, closed_at`, [CORR, HEM, U.owner]).then(one);
  eq([sneaky.status, sneaky.closed_at], ['draft', null], 'status/closure cannot be pre-set');
});

await test('T06', 'Users without a creating role cannot create; owner must hold an owner-eligible role', async () => {
  await fails(newAction(U.staff), 'row-level security');
  await fails(newAction(U.viewer), 'row-level security');
  await fails(newAction(U.owner, { owner: U.staff }), 'owner-eligible');
});

await test('T07', 'Visibility: outsider and other-department manager cannot see; viewer, dept manager, QM can', async () => {
  const cnt = async u => (await as(u, 'select count(*)::int n from public.action_plans where id=$1', [A.id])).rows[0].n;
  eq(await cnt(U.outsider), 0, 'outsider'); eq(await cnt(U.dmOther), 0, 'other dept manager');
  eq(await cnt(U.viewer), 1, 'viewer'); eq(await cnt(U.dm), 1, 'dept manager'); eq(await cnt(U.qm), 1, 'qm');
  eq(await cnt(U.owner), 1, 'owner');
});

await test('T08', 'Viewer cannot edit; nobody can set status directly', async () => {
  const r = await as(U.viewer, `update public.action_plans set title='Changed by viewer' where id=$1 returning id`, [A.id]);
  eq(r.rows.length, 0, 'viewer update should affect 0 rows');
  await fails(as(U.owner, `update public.action_plans set status='closed' where id=$1`, [A.id]), 'workflow');
  await fails(as(U.qm, `update public.action_plans set approved_by=$2 where id=$1`, [A.id, U.qm]), 'workflow');
});

await test('T09', 'Delete is blocked for everyone, including database superuser', async () => {
  await fails(asSuper('delete from public.action_plans where id=$1', [A.id]), 'cannot be deleted');
});

await test('T10', 'Submit requires a measurable target; corrective action goes to Submitted (approval required)', async () => {
  const B = await newAction(U.owner, { target: '' });
  await fails(tr(U.owner, B.id, 'submit'), 'target outcome');
  const a = await tr(U.owner, A.id, 'submit');
  eq([a.status, a.requires_approval, a.requires_effectiveness], ['submitted', true, true]);
});

await test('T11', 'Administrator (without quality role) cannot approve; owner cannot approve own action', async () => {
  await fails(tr(U.admin, A.id, 'approve'), 'not found|quality manager');
  await fails(tr(U.owner, A.id, 'approve'), 'quality manager or the department manager');
});

await test('T12', 'Return for revision requires a comment and sends the action back to Draft', async () => {
  await fails(tr(U.dm, A.id, 'return'), 'comment of at least');
  const a = await tr(U.dm, A.id, 'return', COMMENT);
  eq(a.status, 'draft');
  await as(U.owner, `update public.action_plans set description=$2 where id=$1`, [A.id, 'Calibration drift on XN-330; revised scope after review.']);
  eq((await tr(U.owner, A.id, 'submit')).status, 'submitted');
});

await test('T13', 'Department manager approves (segregation: not creator, not owner)', async () => {
  const a = await tr(U.dm, A.id, 'approve');
  eq([a.status, a.approved_by], ['approved', U.dm]);
});

await test('T14', 'Owner cannot change approved scope, owner or due date directly', async () => {
  await fails(as(U.owner, `update public.action_plans set title='Different title here' where id=$1`, [A.id]), 'may only update implementation');
  await fails(as(U.owner, `update public.action_plans set due_date='2100-01-01' where id=$1`, [A.id]), 'Extend deadline');
  await fails(as(U.dm, `update public.action_plans set owner_id=$2 where id=$1`, [A.id, U.owner2]), 'Reassign');
  await fails(as(U.dm, `update public.action_plans set priority='low' where id=$1`, [A.id]), 'only a quality manager');
});

await test('T15', 'Owner starts the action and assigns staff', async () => {
  eq((await tr(U.owner, A.id, 'start')).status, 'in_progress');
  await as(U.owner, 'select public.action_set_assignees($1, $2)', [A.id, [U.staff]]);
  const n = (await as(U.staff, 'select count(*)::int n from public.action_plans where id=$1', [A.id])).rows[0].n;
  eq(n, 1, 'assigned staff can now see the action');
});

await test('T16', 'Block requires reason; blocked action cannot go to verification', async () => {
  await fails(tr(U.staff, A.id, 'block', 'short'), 'comment of at least');
  const a = await tr(U.staff, A.id, 'block', 'Waiting for calibrator lot delivery from supplier.');
  eq([a.status, a.is_blocked], ['in_progress', true]);
  await fails(tr(U.owner, A.id, 'submit_verification'), 'Unblock');
  eq((await tr(U.owner, A.id, 'unblock')).is_blocked, false);
});

await test('T17', 'Deadline extension: owner refused; dept manager with justification recorded', async () => {
  await fails(as(U.owner, 'select * from public.action_extend_deadline($1,$2,$3)', [A.id, '2100-06-30', 'Supplier delay on calibrator lot']), 'department manager');
  await fails(as(U.dm, 'select * from public.action_extend_deadline($1,$2,$3)', [A.id, '2100-06-30', 'late']), 'justification');
  const a = one(await as(U.dm, 'select * from public.action_extend_deadline($1,$2,$3)', [A.id, '2100-06-30', 'Supplier delay on calibrator lot confirmed in writing']));
  eq([a.due_date instanceof Date ? a.due_date.toISOString().slice(0,10) : String(a.due_date).slice(0,10)], ['2100-06-30']);
  const ext = one(await as(U.viewer, 'select old_due_date::text o, new_due_date::text n from public.deadline_extensions where action_id=$1', [A.id]));
  eq([ext.o, ext.n], ['2099-12-31', '2100-06-30']);
});

await test('T18', 'Reassignment needs justification and an eligible owner', async () => {
  await fails(as(U.dm, 'select * from public.action_reassign($1,$2,$3)', [A.id, U.staff, 'Workload rebalancing in section']), 'owner-eligible');
  await as(U.dm, 'select * from public.action_reassign($1,$2,$3)', [A.id, U.owner2, 'Workload rebalancing in section']);
  await as(U.dm, 'select * from public.action_reassign($1,$2,$3)', [A.id, U.owner, 'Original owner back from leave']);
});

await test('T19', 'Submit for verification requires an implementation summary', async () => {
  await fails(tr(U.owner, A.id, 'submit_verification'), 'implementation summary');
  await as(U.owner, `update public.action_plans set implementation_summary=$2 where id=$1`,
    [A.id, 'Analyzer recalibrated; calibration report filed in equipment record EQ-HEM-001.']);
  eq((await tr(U.owner, A.id, 'submit_verification')).status, 'pending_verification');
});

await test('T20', 'Verification: owner, assigned staff and plain staff refused; reviewer verifies', async () => {
  await fails(tr(U.owner, A.id, 'verify_pass', COMMENT), 'reviewer or quality manager');
  await as(U.admin, `insert into public.user_roles (user_id, role) values ($1,'reviewer')`, [U.staff]);
  await fails(tr(U.staff, A.id, 'verify_pass', COMMENT), 'Segregation of duties');
  await fails(tr(U.reviewer, A.id, 'verify_pass'), 'comment of at least');
  const a = await tr(U.reviewer, A.id, 'verify_pass', 'Calibration report and post-calibration IQC reviewed: acceptable.');
  eq(a.status, 'effectiveness_review', 'corrective actions need effectiveness review');
});

await test('T21', 'Closure is not possible while effectiveness is pending', async () => {
  await fails(tr(U.qm, A.id, 'close'), 'not ready for closure');
});

await test('T22', 'Failed effectiveness sends action back to In Progress', async () => {
  const a = await tr(U.reviewer, A.id, 'effectiveness_fail', 'Two further 1-3s rejections occurred in week 2.');
  eq([a.status, a.completion_date], ['in_progress', null]);
  await tr(U.owner, A.id, 'submit_verification');
  await tr(U.qm, A.id, 'verify_pass', 'Second calibration and reagent lot change verified.');
  eq((await tr(U.reviewer, A.id, 'effectiveness_pass', '30 days without IQC rejection; target met.')).status, 'pending_closure');
});

await test('T23', 'Only quality manager closes; reopen requires justification', async () => {
  await fails(tr(U.dm, A.id, 'close'), 'quality manager');
  const a = await tr(U.qm, A.id, 'close', 'Closed after effectiveness confirmed.');
  eq([a.status, a.closed_by], ['closed', U.qm]);
  await blocked(as(U.qm, `update public.action_plans set title='Edited after closure' where id=$1 returning id`, [A.id]));
  await fails(tr(U.qm, A.id, 'reopen'), 'comment of at least');
  const r = await tr(U.qm, A.id, 'reopen', 'Recurrence found during internal audit IA-2026-07.');
  eq([r.status, r.reopened_count, r.closed_at], ['in_progress', 1, null]);
});

await test('T24', 'Routine low-risk action skips approval and effectiveness review', async () => {
  const R = await newAction(U.owner, { title: 'Replace pipette tips stock', category: ROUT, priority: 'low' });
  const s = await tr(U.owner, R.id, 'submit');
  eq([s.status, s.requires_approval, s.requires_effectiveness], ['approved', false, false]);
  await tr(U.owner, R.id, 'start');
  await as(U.owner, `update public.action_plans set implementation_summary='Stock replenished, GRN-0042 filed.' where id=$1`, [R.id]);
  await tr(U.owner, R.id, 'submit_verification');
  eq((await tr(U.reviewer, R.id, 'verify_pass', 'Stock count confirmed against GRN-0042.')).status, 'pending_closure');
});

await test('T25', 'Policy thresholds: critical priority or high risk forces approval even for routine/improvement', async () => {
  const c = await newAction(U.owner, { title: 'Critical routine task', category: ROUT, priority: 'critical' });
  eq((await tr(U.owner, c.id, 'submit')).status, 'submitted');
  const h = await newAction(U.owner, { title: 'High-risk improvement', category: IMPR, likelihood: 4, severity: 4 });
  eq(h.risk_level, 'high');
  eq((await tr(U.owner, h.id, 'submit')).status, 'submitted');
});

await test('T26', 'Reject is terminal: no edits, no comments, no transitions', async () => {
  const x = await newAction(U.owner, { title: 'Duplicate of existing action' });
  await tr(U.owner, x.id, 'submit');
  eq((await tr(U.qm, x.id, 'reject', 'Duplicate of an existing corrective action.')).status, 'rejected');
  await blocked(as(U.qm, `update public.action_plans set title='Edit rejected one' where id=$1 returning id`, [x.id]));
  await fails(as(U.owner, `insert into public.action_comments (action_id, author_id, body) values ($1,$2,'hi')`, [x.id, U.owner]), 'row-level');
  eq((await as(U.qm, 'select public.action_available_events($1) e', [x.id])).rows[0].e, []);
});

await test('T27', 'Concurrent edits: stale version is refused (RPC and direct update)', async () => {
  const c = await newAction(U.owner, { title: 'Concurrency test action' });
  const v = c.version;
  await as(U.owner, `update public.action_plans set description='First editor saved this change.' where id=$1 and version=$2`, [c.id, v]);
  const second = await as(U.owner, `update public.action_plans set description='Second editor stale' where id=$1 and version=$2 returning id`, [c.id, v]);
  eq(second.rows.length, 0, 'stale direct update must affect 0 rows');
  await fails(tr(U.owner, c.id, 'submit', null, v), 'CONFLICT');
});

await test('T28', 'Available events reflect role and segregation of duties', async () => {
  const c = await newAction(U.owner, { title: 'Events test action' });
  await tr(U.owner, c.id, 'submit');
  const ev = async u => (await as(u, 'select public.action_available_events($1) e', [c.id])).rows[0].e;
  eq(await ev(U.owner), []);
  eq(await ev(U.dm), ['approve', 'return', 'reject']);
  eq(await ev(U.admin), []);
  eq(await ev(U.outsider), []);
});

await test('T29', 'Audit trail records workflow events with user, time and old/new values', async () => {
  const rows = (await as(U.qm, `select event_type, actor_id, changed_fields, old_data->>'status' o, new_data->>'status' n
     from public.audit_events where action_id=$1 and table_name='action_plans' order by id`, [A.id])).rows;
  const events = rows.map(r => r.event_type);
  for (const e of ['submit','return','approve','start','block','unblock','extend_deadline','reassign','submit_verification',
                   'verify_pass','effectiveness_fail','effectiveness_pass','close','reopen'])
    if (!events.includes(e)) throw new Error('audit missing event ' + e);
  const close = rows.find(r => r.event_type === 'close');
  eq([close.actor_id, close.o, close.n], [U.qm, 'pending_closure', 'closed']);
  const ins = (await as(U.qm, `select count(*)::int n from public.audit_events where action_id=$1 and operation='INSERT' and table_name='action_plans'`, [A.id])).rows[0].n;
  eq(ins, 1, 'creation recorded');
  const asg = (await as(U.qm, `select count(*)::int n from public.audit_events where action_id=$1 and table_name='action_assignments'`, [A.id])).rows[0].n;
  if (asg < 1) throw new Error('assignment not audited');
});

await test('T30', 'Audit trail is append-only for users AND database superuser', async () => {
  await fails(as(U.qm, `update public.audit_events set event_type='x'`), 'permission denied');
  await fails(as(U.admin, `delete from public.audit_events`), 'permission denied');
  await fails(as(U.qm, `insert into public.audit_events (module, table_name, operation) values ('x','x','INSERT')`), 'permission denied');
  await fails(asSuper(`update public.audit_events set event_type='tampered' where id=1`), 'append-only');
  await fails(asSuper(`delete from public.audit_events where id=1`), 'append-only');
  await fails(asSuper(`truncate public.audit_events`), 'append-only');
});

await test('T31', 'Audit visibility follows action visibility', async () => {
  const n = async u => (await as(u, 'select count(*)::int n from public.audit_events where action_id=$1', [A.id])).rows[0].n;
  if ((await n(U.viewer)) < 10) throw new Error('viewer should see action audit');
  eq(await n(U.outsider), 0, 'outsider sees no audit for the action');
  eq(await n(U.dmOther), 0, 'other dept manager sees no audit');
});

await test('T32', 'Register view: overdue calculation in laboratory timezone, RLS respected', async () => {
  await asSuper(`alter table public.action_plans disable trigger action_plans_guard`);
  const old = await newAction(U.owner, { title: 'Overdue test action' });
  await asSuper(`update public.action_plans set due_date = public.app_today() - 3 where id=$1`, [old.id]);
  await asSuper(`alter table public.action_plans enable trigger action_plans_guard`);
  const r = one(await as(U.viewer, 'select is_overdue, days_overdue, owner_name, category_name, department_code from public.action_register_v where id=$1', [old.id]));
  eq([r.is_overdue, r.days_overdue, r.owner_name, r.department_code], [true, 3, 'OWNER', 'HEM']);
  eq((await as(U.outsider, 'select count(*)::int n from public.action_register_v')).rows[0].n, 0);
});

await test('T33', 'Quality manager can change policy settings; administrator cannot', async () => {
  const r = await as(U.admin, `update public.action_settings set approval_min_priority='low' returning id`);
  eq(r.rows.length, 0, 'admin update affects 0 rows');
  await as(U.qm, `update public.action_settings set due_soon_days=10`);
  eq((await as(U.viewer, 'select due_soon_days from public.action_settings')).rows[0].due_soon_days, 10);
});

await test('T34', 'Deactivated user loses access immediately', async () => {
  await as(U.admin, 'update public.profiles set active=false where id=$1', [U.viewer]);
  eq((await as(U.viewer, 'select count(*)::int n from public.action_plans')).rows[0].n, 0);
  await as(U.admin, 'update public.profiles set active=true where id=$1', [U.viewer]);
});

await test('T35', 'Comments: visible users may comment; author is enforced', async () => {
  await as(U.staff, `insert into public.action_comments (action_id, author_id, body) values ($1,$2,'Calibrator arrived today.')`, [A.id, U.staff]);
  await fails(as(U.staff, `insert into public.action_comments (action_id, author_id, body) values ($1,$2,'Forged author')`, [A.id, U.owner]), 'row-level');
  await fails(as(U.outsider, `insert into public.action_comments (action_id, author_id, body) values ($1,$2,'Not mine')`, [A.id, U.outsider]), 'row-level');
  await fails(as(U.staff, `delete from public.action_comments where action_id=$1`, [A.id]), 'permission denied');
});

// ---------- report ----------
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} tests passed`);
const pgv = (await db.query('select version() v')).rows[0].v.split(' on ')[0];
const md = [
  '# Database test results — Phase 1',
  '',
  `Run: ${new Date().toISOString()}  ·  Engine: ${pgv} (embedded) with Supabase auth stub`,
  `Result: **${passed}/${results.length} passed**`,
  '',
  '| ID | Test | Result |', '|---|---|---|',
  ...results.map(r => `| ${r.id} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL — ' + r.err.replace(/\|/g, '/')} |`),
  '',
  'These tests verify the database rules (RLS, workflow, segregation of duties, audit trail).',
  'They do not replace user acceptance testing on your Supabase project — see docs/UAT_CHECKLIST.md.',
].join('\n');
writeFileSync(join(here, 'TEST_RESULTS.md'), md + '\n');
process.exit(passed === results.length ? 0 : 1);
