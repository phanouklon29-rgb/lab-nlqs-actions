import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ErrorBox, Field } from '../components/ui';

/** Shown after following a password-reset or invitation link. */
export default function SetPassword() {
  const { clearRecovery } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 10) return setError('Use at least 10 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else clearRecovery();
  }

  return (
    <div className="center-page">
      <form className="card narrow stack" onSubmit={submit}>
        <h2>Set a new password</h2>
        <ErrorBox error={error} />
        <Field label="New password" hint="At least 10 characters">
          <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} required />
        </Field>
        <Field label="Repeat new password">
          <input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required />
        </Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  );
}
