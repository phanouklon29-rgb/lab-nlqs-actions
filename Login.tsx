import { useState, type FormEvent } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
import { ErrorBox, Field } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(/invalid login/i.test(error.message) ? 'Email or password is incorrect.' : errorMessage(error));
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) setError(errorMessage(error));
      else setInfo('If this email is registered, a password reset link has been sent.');
    }
    setBusy(false);
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="brand brand-lg">
          <span className="brand-mark">✓</span>
          <div>
            <div className="brand-name">LAB NLQS</div>
            <div className="brand-sub">Action Plan Control Management</div>
          </div>
        </div>
        <form onSubmit={submit} className="stack">
          <h2>{mode === 'signin' ? 'Sign in' : 'Reset password'}</h2>
          <ErrorBox error={error} />
          {info && <div className="alert alert-ok">{info}</div>}
          <Field label="Email">
            <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          {mode === 'signin' && (
            <Field label="Password">
              <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
            </Field>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
          </button>
          <button type="button" className="link-btn" onClick={() => { setMode(mode === 'signin' ? 'forgot' : 'signin'); setError(null); setInfo(null); }}>
            {mode === 'signin' ? 'Forgot password?' : 'Back to sign in'}
          </button>
          <p className="muted small">Accounts are created by your LAB NLQS administrator. ISO 15189:2022 · 12 QSE aligned.</p>
        </form>
      </div>
    </div>
  );
}
