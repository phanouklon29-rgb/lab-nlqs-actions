import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ActionStatus, Priority, RiskLevel } from '../lib/types';
import { PRIORITY_LABEL, RISK_LABEL, STATUS_LABEL } from '../lib/format';

export function StatusBadge({ status, blocked }: { status: ActionStatus; blocked?: boolean }) {
  return (
    <span className="badge-group">
      <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>
      {blocked && <span className="badge badge-blocked">Blocked</span>}
    </span>
  );
}
export function PriorityBadge({ p }: { p: Priority }) {
  return <span className={`badge prio-${p}`}>{PRIORITY_LABEL[p]}</span>;
}
export function RiskBadge({ r, score }: { r: RiskLevel; score?: number }) {
  return <span className={`badge risk-${r}`}>{RISK_LABEL[r]}{score != null ? ` · ${score}` : ''}</span>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="spinner" role="status"><span className="spinner-dot" />{label}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="alert alert-error" role="alert">{error}</div>;
}

export function Field({ label, hint, required, children, wide }: {
  label: string; hint?: string; required?: boolean; children: ReactNode; wide?: boolean;
}) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="field-label">{label}{required && <span className="req"> *</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---- toasts ----
interface Toast { id: number; text: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{toasts.map(t => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
