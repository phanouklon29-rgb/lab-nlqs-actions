import { useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useRefData } from '../../lib/refdata';
import { ROLE_HELP, ROLE_LABEL } from '../../lib/format';
import type { AppRole, Profile } from '../../lib/types';
import { ErrorBox, Field, Modal, useToast } from '../../components/ui';

const ROLES = Object.keys(ROLE_LABEL) as AppRole[];

export default function UsersAdmin() {
  const ref = useRefData();
  const { profile: me } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const rolesOf = (id: string) => ref.userRoles.filter(r => r.user_id === id);
  const deptName = (id: string | null) => ref.departments.find(d => d.id === id)?.name ?? '';
  const list = ref.profiles.filter(p => `${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase()));

  async function setActive(p: Profile, active: boolean) {
    setError(null);
    const { error } = await supabase.from('profiles').update({ active }).eq('id', p.id);
    if (error) setError(errorMessage(error)); else { toast(`${p.full_name || p.email} ${active ? 'reactivated' : 'deactivated'}`); await ref.reload(); }
  }

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div><h1>Users &amp; roles</h1><p className="muted">{ref.profiles.length} user accounts</p></div>
      </header>
      <div className="alert alert-info">
        <b>Adding a user:</b> in the Supabase dashboard open <i>Authentication → Users → Invite user</i> and enter their email.
        They appear here immediately; grant roles below. Users without a role can sign in but see nothing.
        You cannot change your own roles — another administrator must do it.
      </div>
      <ErrorBox error={error} />
      <div className="filters card"><input className="search" placeholder="Search name or email…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Roles</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id} className={p.active ? '' : 'row-muted'}>
                <td>{p.full_name || <span className="muted">(no name)</span>}<div className="muted small">{p.job_title}</div></td>
                <td>{p.email}</td>
                <td>{deptName(p.department_id) || <span className="muted">—</span>}</td>
                <td>{rolesOf(p.id).map(r => <span key={r.id} className="badge badge-role">{ROLE_LABEL[r.role]}{r.department_id ? ` · ${ref.departments.find(d => d.id === r.department_id)?.code}` : ''}</span>)}
                  {rolesOf(p.id).length === 0 && <span className="muted small">No role</span>}</td>
                <td>{p.active ? 'Active' : 'Deactivated'}</td>
                <td className="nowrap">
                  <button className="btn btn-sm" onClick={() => setEditing(p)}>Manage</button>{' '}
                  {p.id !== me?.id && (p.active
                    ? <button className="btn btn-sm btn-ghost" onClick={() => setActive(p, false)}>Deactivate</button>
                    : <button className="btn btn-sm btn-ghost" onClick={() => setActive(p, true)}>Reactivate</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ManageUser p={editing} self={editing.id === me?.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ManageUser({ p, self, onClose }: { p: Profile; self: boolean; onClose: () => void }) {
  const ref = useRefData();
  const toast = useToast();
  const [dept, setDept] = useState(p.department_id ?? '');
  const [role, setRole] = useState<AppRole>('action_owner');
  const [roleDept, setRoleDept] = useState('');
  const [error, setError] = useState<string | null>(null);
  const roles = ref.userRoles.filter(r => r.user_id === p.id);

  async function saveDept() {
    setError(null);
    const { error } = await supabase.from('profiles').update({ department_id: dept || null }).eq('id', p.id);
    if (error) setError(errorMessage(error)); else { toast('Department updated'); await ref.reload(); }
  }
  async function addRole() {
    setError(null);
    const { error } = await supabase.from('user_roles').insert({ user_id: p.id, role, department_id: role === 'department_manager' ? roleDept : null });
    if (error) setError(/duplicate|unique/i.test(error.message) ? 'This user already has that role.' : errorMessage(error));
    else { toast(`${ROLE_LABEL[role]} granted`); await ref.reload(); }
  }
  async function removeRole(id: string) {
    setError(null);
    const { error } = await supabase.from('user_roles').delete().eq('id', id);
    if (error) setError(errorMessage(error)); else { toast('Role removed'); await ref.reload(); }
  }

  return (
    <Modal title={p.full_name || p.email} onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      <ErrorBox error={error} />
      <div className="stack">
        <Field label="Department">
          <div className="row">
            <select value={dept} onChange={e => setDept(e.target.value)}>
              <option value="">—</option>
              {ref.departments.filter(d => d.active || d.id === dept).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn btn-sm" onClick={saveDept} disabled={(p.department_id ?? '') === dept}>Save</button>
          </div>
        </Field>
        <div>
          <div className="field-label">Current roles</div>
          {roles.length === 0 && <p className="muted small">None</p>}
          <ul className="role-list">
            {roles.map(r => (
              <li key={r.id} className="row space-between">
                <span><b>{ROLE_LABEL[r.role]}</b>{r.department_id && ` — ${ref.departments.find(d => d.id === r.department_id)?.name}`}</span>
                {!self && <button className="btn btn-sm btn-ghost" onClick={() => removeRole(r.id)}>Remove</button>}
              </li>
            ))}
          </ul>
        </div>
        {self ? <div className="alert alert-info">You cannot change your own roles (segregation of duties).</div> : (
          <div className="stack">
            <div className="field-label">Grant a role</div>
            <div className="row wrap">
              <select value={role} onChange={e => setRole(e.target.value as AppRole)}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              {role === 'department_manager' && (
                <select value={roleDept} onChange={e => setRoleDept(e.target.value)}>
                  <option value="">Department…</option>
                  {ref.departments.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              <button className="btn btn-primary btn-sm" onClick={addRole} disabled={role === 'department_manager' && !roleDept}>Grant</button>
            </div>
            <p className="muted small">{ROLE_HELP[role]}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
