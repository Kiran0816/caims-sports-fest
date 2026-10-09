import { useState } from 'react';
import { Modal } from '../../components/ui';

export function useForm(initial) {
  const [v, setV] = useState(initial);
  const bind = (k) => ({ value: v[k] ?? '', onChange: (e) => setV((x) => ({ ...x, [k]: e.target.value })) });
  const check = (k) => ({ checked: !!v[k], onChange: (e) => setV((x) => ({ ...x, [k]: e.target.checked })) });
  return [v, setV, bind, check];
}
export const AdminHead = ({ title, children, action }) => (
  <div className="sec-head" style={{ marginBottom: '.6rem' }}><div><h2>{title}</h2>{children && <p className="muted" style={{ margin: '.3rem 0 0' }}>{children}</p>}</div>{action}</div>
);
// Modal with a form: validates via `validate(values)` returning an error string, then awaits onSave.
export function FormModal({ title, onClose, onSave, children, saveLabel = 'Save', validate }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const v = validate?.(); if (v) return setErr(v);
    setBusy(true); setErr('');
    try { await onSave(); onClose(); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate><div className="form-grid">{children}</div>
        {err && <p className="err" role="alert" style={{ marginTop: '.8rem' }}>{err}</p>}
        <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving…' : saveLabel}</button></div>
      </form>
    </Modal>
  );
}
// Checkbox list that applies each change immediately (used for team <-> sport enrolment).
export function ToggleModal({ title, intro, items, checked, onToggle, onClose }) {
  const [on, setOn] = useState(new Set(checked));
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const flip = async (id) => {
    setBusy(id); setErr('');
    try { await onToggle(id, !on.has(id)); const n = new Set(on); n.has(id) ? n.delete(id) : n.add(id); setOn(n); }
    catch (e) { setErr(e.message); }
    setBusy(null);
  };
  return (
    <Modal title={title} onClose={onClose}>
      {intro && <p className="muted">{intro}</p>}
      <div style={{ display: 'grid', gap: '.4rem' }}>{items.map((i) => (
        <label key={i.id} className="check" style={{ minHeight: 40 }}><input type="checkbox" checked={on.has(i.id)} disabled={busy === i.id} onChange={() => flip(i.id)} />{i.name}</label>
      ))}</div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions"><button className="btn" onClick={onClose}>Done</button></div>
    </Modal>
  );
}
