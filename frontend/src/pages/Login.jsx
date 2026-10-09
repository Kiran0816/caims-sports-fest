import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { usePageTitle } from '../services/hooks';

export default function Login() {
  usePageTitle('Admin Login');
  const { admin, login, ready } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (ready && admin) return <Navigate to="/admin" replace />;
  const submit = async (e) => {
    e.preventDefault();
    if (!f.username.trim() || !f.password) return setErr('Enter your username and password.');
    setBusy(true); setErr('');
    try { await login(f.username.trim(), f.password); nav(loc.state?.from || '/admin', { replace: true }); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <div className="login"><form onSubmit={submit} noValidate>
      <h2>Admin login</h2>
      <label className="f">Username<input autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoFocus /></label>
      <label className="f">Password<input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <Link to="/" className="link-more small">Back to the website</Link>
    </form></div>
  );
}
