import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync, usePolling, usePageTitle } from '../services/hooks';
import { Async, Empty, PageHead, StatusBadge, ErrorState } from '../components/ui';
import { MatchCard, Scoreboard } from '../components/Match';
import { PhotoGrid } from './Content';
import { fmtDate, fmtTime, ago } from '../services/format';

function SportFilter({ value, onChange }) {
  const sports = useAsync(() => api.get('/sports'), []);
  if (!sports.data) return null;
  return (
    <div className="chips" role="group" aria-label="Filter by sport" style={{ marginBottom: '1.2rem' }}>
      <button className="chip" aria-pressed={!value} onClick={() => onChange('')}>All sports</button>
      {sports.data.map((s) => <button key={s.id} className="chip" aria-pressed={value === s.slug} onClick={() => onChange(s.slug)}>{s.name}</button>)}
    </div>
  );
}
function grouped(list) {
  const out = new Map();
  for (const m of list) { if (!out.has(m.date)) out.set(m.date, []); out.get(m.date).push(m); }
  return [...out.entries()];
}

export function Schedule() {
  usePageTitle('Schedule', 'Upcoming CAIMS Sports Fest 2026 matches with date, time, venue and teams.');
  const [sport, setSport] = useState('');
  const state = usePolling(() => api.get(`/matches?bucket=schedule${sport ? `&sport=${sport}` : ''}`), 15000, [sport]);
  return (
    <>
      <PageHead title="Schedule">Upcoming matches, with date, time and venue.</PageHead>
      <div className="wrap section">
        <SportFilter value={sport} onChange={setSport} />
        <Async state={state} empty="No upcoming matches for this selection.">{(list) => grouped(list).map(([d, ms]) => (
          <section key={d} style={{ marginBottom: '1.6rem' }}><h3 style={{ marginBottom: '.6rem' }}>{fmtDate(d)}</h3><div className="grid g2">{ms.map((m) => <MatchCard key={m.id} m={m} />)}</div></section>
        ))}</Async>
      </div>
    </>
  );
}

export function Live() {
  usePageTitle('Live Matches', 'Live scores from CAIMS Sports Fest 2026. Scores refresh automatically every 5 seconds.');
  const [sport, setSport] = useState('');
  const s = usePolling(() => api.get('/matches/live'), 5000);
  const list = (s.data || []).filter((m) => !sport || m.sport.slug === sport);
  return (
    <>
      <PageHead title="Live matches">Scores refresh automatically every 5 seconds. No need to reload the page.</PageHead>
      <div className="wrap section">
        {s.error && s.data && <div className="banner bad" role="alert" style={{ borderRadius: 10, marginBottom: '1rem' }}>Connection problem. Showing the last scores we received. Retrying…</div>}
        {s.updatedAt && <p className="small muted" aria-live="off">Last checked {ago(s.updatedAt.toISOString())}</p>}
        <SportFilter value={sport} onChange={setSport} />
        {s.loading && !s.data ? <Async state={{ ...s, reload: () => {} }}>{() => null}</Async>
          : s.error && !s.data ? <ErrorState message={s.error} />
          : list.length ? <div className="grid" style={{ gap: '1.2rem' }}>{list.map((m) => <Scoreboard key={m.id} m={m} fetchedAt={s.updatedAt} />)}</div>
          : <Empty action={<Link to="/schedule" className="btn sm">See the schedule</Link>}>No matches are currently live.</Empty>}
      </div>
    </>
  );
}

export function Results() {
  usePageTitle('Results', 'Final scores and winners from CAIMS Sports Fest 2026.');
  const [sport, setSport] = useState('');
  const state = usePolling(() => api.get(`/matches?bucket=results${sport ? `&sport=${sport}` : ''}`), 20000, [sport]);
  return (
    <>
      <PageHead title="Results">Final scores and winners.</PageHead>
      <div className="wrap section">
        <SportFilter value={sport} onChange={setSport} />
        <Async state={state} empty="No completed matches yet.">{(list) => <div className="grid g2">{list.map((m) => <MatchCard key={m.id} m={m} />)}</div>}</Async>
      </div>
    </>
  );
}

export function MatchDetail() {
  const { id } = useParams();
  const s = usePolling(() => api.get(`/matches/${id}`), 6000, [id]);
  const m = s.data;
  usePageTitle(m ? `${m.team1.name} vs ${m.team2.name} - ${m.sport.name}` : 'Match');
  return (
    <div className="wrap section">
      <Link to="/schedule" className="link-more">&larr; Schedule</Link>
      <div style={{ marginTop: '1rem' }}>
        <Async state={{ ...s, reload: () => window.location.reload() }}>{(m) => (
          <>
            {m.status === 'live' ? <Scoreboard m={m} fetchedAt={s.updatedAt} /> : (
              <div className="card"><MatchCard m={m} /></div>
            )}
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3>Match details</h3>
              <p><StatusBadge status={m.status} /></p>
              <p className="muted">{[m.match_type, m.round?.name, m.match_number && `Match ${m.match_number}`].filter(Boolean).join(' • ')}</p>
              <p>{fmtDate(m.date)} at {fmtTime(m.time)}{m.venue ? `, ${m.venue}` : ''}</p>
              {m.summary && <p><strong>Summary:</strong> {m.summary}</p>}
              {m.notes && <p><strong>Note:</strong> {m.notes}</p>}
              {m.poster_url && <img src={m.poster_url} alt={`Poster for ${m.team1.name} vs ${m.team2.name}`} loading="lazy" style={{ borderRadius: 12, maxHeight: 360, objectFit: 'cover' }} />}
              {m.events?.length > 0 && <><h3 style={{ marginTop: '1rem' }}>Match events</h3><ul>{m.events.map((e) => <li key={e.id}>{e.minute && <b>{e.minute} </b>}{e.description}</li>)}</ul></>}
            </div>
            {m.photos?.length > 0 && <div style={{ marginTop: '1rem' }}><h3 style={{ marginBottom: '.6rem' }}>Photos</h3><PhotoGrid photos={m.photos} /></div>}
          </>
        )}</Async>
      </div>
    </div>
  );
}
