import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync, usePageTitle } from '../services/hooks';
import { Async, PageHead } from '../components/ui';
import { CATEGORIES, fmtDate } from '../services/format';

export function AnnouncementCard({ a }) {
  return (
    <article className={`ann ${a.priority}`}>
      {a.priority !== 'normal' && <span className={`badge ${a.priority === 'urgent' ? 'live' : 'postponed'}`}>{a.priority === 'urgent' ? 'Urgent' : 'Important'}</span>}
      <h3>{a.title}</h3>{a.body && <p style={{ whiteSpace: 'pre-line' }}>{a.body}</p>}
      {a.image_url && <img src={a.image_url} alt="" loading="lazy" />}
      <p className="small muted" style={{ margin: '.5rem 0 0' }}>{fmtDate((a.created_at || '').slice(0, 10))}</p>
    </article>
  );
}
export function WinnerCard({ w }) {
  return (
    <div className="winner">
      <div className="muted small">{w.sport} &middot; {w.year}</div>
      <div className="champ">{w.champion}</div>
      <div>Champion{w.runner_up ? <span className="muted"> &middot; Runner-up: {w.runner_up}</span> : null}</div>
    </div>
  );
}
export function PhotoGrid({ photos }) {
  const [open, setOpen] = useState(null);
  useEffect(() => { const k = (e) => e.key === 'Escape' && setOpen(null); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
  return (
    <>
      <div className="gal">{photos.map((p) => (
        <figure key={p.id}><button onClick={() => setOpen(p)} aria-label={`Open photo${p.caption ? `: ${p.caption}` : ''}`}>
          <img src={p.thumb_url || p.url} alt={p.caption || 'Sports fest photo'} loading="lazy" decoding="async" width="480" height="360" /></button>
          {p.caption && <figcaption>{p.caption}</figcaption>}</figure>
      ))}</div>
      {open && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={() => setOpen(null)}>
        <div><img src={open.url} alt={open.caption || 'Sports fest photo'} />{open.caption && <p>{open.caption}</p>}<p><button className="btn ghost sm" style={{ color: '#fff', borderColor: '#fff' }} autoFocus onClick={() => setOpen(null)}>Close</button></p></div></div>}
    </>
  );
}

export function Teams() {
  usePageTitle('Teams', 'Teams and the sports they play at CAIMS Sports Fest 2026.');
  const state = useAsync(() => api.get('/teams'), []);
  return (
    <>
      <PageHead title="Teams">Every team and the sports it plays.</PageHead>
      <div className="wrap section"><Async state={state} empty="No teams have been added yet.">{(list) => (
        <div className="grid g2">{list.map((t) => (
          <article className="card team-card" key={t.id}>
            {t.logo_url ? <img className="team-logo" src={t.logo_url} alt={`${t.name} logo`} loading="lazy" /> : <div className="team-logo" aria-hidden="true">{t.name.slice(0, 4)}</div>}
            <div><h3>{t.name}</h3>{t.description && <p className="muted">{t.description}</p>}
              {t.sports.length ? <div className="chips">{t.sports.map((s) => <Link key={s.id} className="chip" to={`/sports/${s.slug}`} style={{ textDecoration: 'none' }}>{s.name}</Link>)}</div> : <p className="small muted">Not entered in any sport yet.</p>}
              {t.photo_url && <img src={t.photo_url} alt={`${t.name} team`} loading="lazy" style={{ borderRadius: 10, marginTop: '.8rem', maxHeight: 200, objectFit: 'cover', width: '100%' }} />}</div>
          </article>))}</div>
      )}</Async></div>
    </>
  );
}

export function Gallery() {
  usePageTitle('Gallery', 'Photos from CAIMS Sports Fest 2026.');
  const [cat, setCat] = useState('');
  const state = useAsync(() => api.get(`/photos${cat ? `?category=${cat}` : ''}`), [cat]);
  return (
    <>
      <PageHead title="Gallery">Moments from the fest.</PageHead>
      <div className="wrap section">
        <div className="chips" role="group" aria-label="Filter by category" style={{ marginBottom: '1.2rem' }}>
          <button className="chip" aria-pressed={!cat} onClick={() => setCat('')}>All</button>
          {CATEGORIES.map(([k, l]) => <button key={k} className="chip" aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}
        </div>
        <Async state={state} empty="No photos here yet.">{(list) => <PhotoGrid photos={list} />}</Async>
      </div>
    </>
  );
}

export function Announcements() {
  usePageTitle('Announcements', 'Latest announcements for CAIMS Sports Fest 2026.');
  const state = useAsync(() => api.get('/announcements'), []);
  return (
    <>
      <PageHead title="Announcements">Schedule changes and important notices.</PageHead>
      <div className="wrap section"><Async state={state} empty="No announcements right now.">{(list) => <div className="grid g2">{list.map((a) => <AnnouncementCard key={a.id} a={a} />)}</div>}</Async></div>
    </>
  );
}

export function Winners() {
  usePageTitle('Winners', 'Champions of CAIMS Sports Fest 2026.');
  const state = useAsync(() => api.get('/winners'), []);
  return (
    <>
      <PageHead title="Winners">Champions and runners-up.</PageHead>
      <div className="wrap section"><Async state={state} empty="Champions will appear here after the finals are played.">{(list) => <div className="grid g3">{list.map((w) => <WinnerCard key={w.id} w={w} />)}</div>}</Async></div>
    </>
  );
}
