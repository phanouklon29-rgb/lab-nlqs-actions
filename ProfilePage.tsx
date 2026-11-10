import { useState } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useRefData } from '../lib/refdata';
import { ROLE_HELP, ROLE_LABEL } from '../lib/format';
import { ErrorBox, Field, useToast } from '../components/ui';

export default function ProfilePage() {
  const { profile, roles, refresh } = useAuth();
  const ref = useRefData();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [title, setTitle] = useState(profile?.job_title ?? '');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), job_title: title.trim() || null }).eq('id', profile!.id);
    if (error) return setError(errorMessage(error));
    await refresh(); await ref.reload(); toast('Profile saved');
  }
  async function changePw() {
    setError(null);
    if (pw.length < 10) return setError('Use at least 10 characters.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setError(errorMessage(error));
    setPw(''); toast('Password changed');
  }

  return (
    <div className="page">
      <header className="page-head"><h1>My profile</h1></header>
      <ErrorBox error={error} />
      <div className="detail-grid">
        <section className="card stack">
          <h3>Details</h3>
          <Field label="Email"><input value={profile?.email ?? ''} disabled /></Field>
          <Field label="Full name"><input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Job title"><input value={title} onChange={e => setTitle(e.target.value)} /></Field>
          <Field label="Department" hint="Set by an administrator"><input value={ref.departments.find(d => d.id === profile?.department_id)?.name ?? '—'} disabled /></Field>
          <div><button className="btn btn-primary" onClick={save} disabled={!name.trim()}>Save</button></div>
        </section>
        <section className="card stack">
          <h3>My roles</h3>
          <ul className="role-list">
            {roles.map((r, i) => (
              <li key={i}><b>{ROLE_LABEL[r.role]}</b>{r.department_id && ` — ${ref.departments.find(d => d.id === r.department_id)?.name}`}
                <div className="muted small">{ROLE_HELP[r.role]}</div></li>
            ))}
          </ul>
          <h3>Change password</h3>
          <Field label="New password" hint="At least 10 characters"><input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
          <div><button className="btn" onClick={changePw} disabled={!pw}>Change password</button></div>
        </section>
      </div>
    </div>
  );
}
