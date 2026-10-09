import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { STATUS_LABEL } from '../services/format';
import { api } from '../services/api';

export function StatusBadge({ status }) {
  return (
    <span className={`badge ${status}`}>
      {status === 'live' && <span className="live-dot" aria-hidden="true" />}
      <span className="sr">Status: </span>{STATUS_LABEL[status] || status}
    </span>
  );
}
export const Loading = ({ rows = 3 }) => (
  <div className="grid g2" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div className="skel" key={i} />)}</div>
);
export const Empty = ({ children, action }) => <div className="state">{children}{action && <div style={{ marginTop: '.8rem' }}>{action}</div>}</div>;
export const ErrorState = ({ message, onRetry }) => (
  <div className="state error" role="alert"><p>{message || 'Something went wrong.'}</p>{onRetry && <button className="btn sm" onClick={onRetry}>Try again</button>}</div>
);
// Renders loading / error / empty / content for a useAsync-style result.
export function Async({ state, empty, children, rows }) {
  if (state.loading && state.data === null) return <Loading rows={rows} />;
  if (state.error && state.data === null) return <ErrorState message={state.error} onRetry={state.reload} />;
  const d = state.data;
  if (empty && (Array.isArray(d) ? d.length === 0 : false)) return <Empty>{empty}</Empty>;
  return children(d);
}
export const Section = ({ title, to, linkText, children, alt }) => (
  <section className={`section${alt ? ' alt' : ''}`}><div className="wrap">
    <div className="sec-head"><h2>{title}</h2>{to && <a className="link-more" href={to}>{linkText || 'View all'}</a>}</div>{children}
  </div></section>
);
export const PageHead = ({ title, children }) => <header className="page-head"><div className="wrap"><h1>{title}</h1>{children && <p>{children}</p>}</div></header>;

// ---- toasts ----
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  const toast = useCallback((m) => push(m, 'ok'), [push]);
  toast.error = (m) => push(m, 'error');
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">{items.map((i) => <div key={i.id} className={`toast ${i.kind}`} role={i.kind === 'error' ? 'alert' : 'status'}>{i.message}</div>)}</div>
    </ToastCtx.Provider>
  );
}

// ---- modal + confirm ----
export function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('input,select,textarea,button')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}><h3>{title}</h3>{children}</div>
    </div>
  );
}
const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setReq({ ...opts, resolve })), []);
  const done = (v) => { req.resolve(v); setReq(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req && (
        <Modal title={req.title || 'Are you sure?'} onClose={() => done(false)}>
          <p>{req.message}</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => done(false)}>Cancel</button>
            <button className="btn danger" onClick={() => done(true)}>{req.confirmLabel || 'Delete'}</button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ---- form helpers ----
export const Field = ({ label, hint, error, children }) => (
  <label className="f">{label}{children}{hint && <span className="hint">{hint}</span>}{error && <span className="err" role="alert">{error}</span>}</label>
);
export function ImageField({ label, value, onChange, alt }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true); setErr('');
    try { const fd = new FormData(); fd.append('image', file); onChange((await api.upload('/uploads', fd)).url); }
    catch (x) { setErr(x.message); }
    setBusy(false); e.target.value = '';
  };
  return (
    <div className="f"><span style={{ fontWeight: 600, fontSize: '.9rem' }}>{label}</span>
      {value && <img src={value} alt={alt || label} style={{ height: 70, width: 'auto', borderRadius: 8, objectFit: 'cover' }} />}
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} aria-label={`Upload ${label}`} disabled={busy} />
      {busy && <span className="hint">Uploading…</span>}{err && <span className="err" role="alert">{err}</span>}
      {value && <button type="button" className="btn ghost sm" onClick={() => onChange(null)}>Remove image</button>}
    </div>
  );
}
// Runs an async action with toast feedback; returns true on success.
export function useAction() {
  const toast = useToast();
  return useCallback(async (fn, okMsg) => {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r === undefined ? true : r; }
    catch (e) { toast.error(e.message); return false; }
  }, [toast]);
}
