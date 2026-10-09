import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { api } from '../services/api';


const LINKS = [['/', 'Home'], ['/sports', 'Sports'], ['/schedule', 'Schedule'], ['/live', 'Live Matches'], ['/results', 'Results'], ['/teams', 'Teams'],
  ['/gallery', 'Gallery'], ['/announcements', 'Announcements'], ['/winners', 'Winners'], ['/admin/login', 'Admin Login']];

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const [liveCount, setLive] = useState(0);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => { let off = false; const f = () => !document.hidden && api.get('/matches/live').then((l) => !off && setLive(l.length)).catch(() => {}); f(); const t = setInterval(f, 15000); return () => { off = true; clearInterval(t); }; }, []);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <nav className="nav" aria-label="Main">
        <div className="wrap">
          <Link to="/" className="brand"><i aria-hidden="true" />CAIMS Sports Fest 2026</Link>
          <button className="burger" aria-expanded={open} aria-controls="menu" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}</button>
          <ul id="menu" className={open ? 'open' : ''}>
            {LINKS.map(([to, label]) => (
              <li key={to}><NavLink end={to === '/'} to={to} className={({ isActive }) => `l${isActive ? ' active' : ''}`}>
                {to === '/live' && liveCount > 0 && <span className="live-dot" aria-hidden="true" />}{label}{to === '/live' && liveCount > 0 && <span className="sr"> ({liveCount} live now)</span>}
              </NavLink></li>
            ))}
          </ul>
        </div>
      </nav>
      <main id="main"><Outlet /></main>
      <footer className="foot"><div className="wrap">
        <strong style={{ color: '#fff' }}>CAIMS Sports Fest 2026</strong><br />Chalmeda Anand Rao Institute of Medical Sciences
      </div></footer>
    </>
  );
}

const ADMIN_LINKS = [['/admin', 'Dashboard'], ['/admin/sports', 'Sports'], ['/admin/teams', 'Teams'], ['/admin/matches', 'Upcoming Matches'], ['/admin/live', 'Live Matches'],
  ['/admin/results', 'Results'], ['/admin/brackets', 'Tournament Brackets'], ['/admin/gallery', 'Gallery'], ['/admin/announcements', 'Announcements'],
  ['/admin/winners', 'Winners'], ['/admin/admins', 'Admin Management'], ['/admin/settings', 'Settings']];

export function AdminLayout() {
  const { admin, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  if (!ready) return <div className="wrap" style={{ padding: '3rem 0' }} role="status">Loading…</div>;
  if (!admin) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  return (
    <div className="admin">
      <div className="top-m"><button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="side">Menu</button><strong>Admin</strong></div>
      <aside id="side" className={`side${open ? ' open' : ''}`}>
        <Link to="/" className="brand"><i aria-hidden="true" />CAIMS Admin</Link>
        <nav aria-label="Admin">
          {ADMIN_LINKS.filter(([to]) => to !== '/admin/admins' || admin.role === 'super_admin').map(([to, label]) => (
            <NavLink key={to} end={to === '/admin'} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
          <button className="nl" onClick={logout}>Logout ({admin.username})</button>
        </nav>
      </aside>
      <div>
        {admin.must_change_password && <div className="banner warn" role="alert">You are using a temporary password. <Link to="/admin/settings">Change it now</Link>.</div>}
        <div className="main"><Outlet /></div>
      </div>
    </div>
  );
}
