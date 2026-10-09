import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync, usePolling, usePageTitle } from '../services/hooks';
import { Async, Empty, PageHead } from '../components/ui';
import { MatchCard, Scoreboard } from '../components/Match';
import { Bracket } from '../components/Bracket';
import { PhotoGrid } from './Content';

export function Sports() {
  usePageTitle('Sports', 'All sports at CAIMS Sports Fest 2026.');
  const state = useAsync(() => api.get('/sports'), []);
  return (
    <>
      <PageHead title="Sports">Pick a sport to see its matches, teams, results and photos.</PageHead>
      <div className="wrap section"><Async state={state} empty="No sports have been added yet.">{(list) => (
        <div className="grid g3">{list.map((s) => (
          <Link key={s.id} to={`/sports/${s.slug}`} className="sport-card">
            {s.live_count > 0 && <span className="badge live"><span className="live-dot" aria-hidden="true" />Live</span>}
            <h3>{s.name}</h3><span className="meta">{s.team_count} {s.team_count === 1 ? 'team' : 'teams'}</span>
          </Link>
        ))}</div>
      )}</Async></div>
    </>
  );
}

export function SportDetail() {
  const { slug } = useParams();
  const s = usePolling(() => api.get(`/sports/${slug}`), 10000, [slug]);
  const [tab, setTab] = useState('matches');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState('');
  const d = s.data;
  usePageTitle(d?.sport.name, d && `${d.sport.name} matches, results, teams and photos at CAIMS Sports Fest 2026.`);
  return (
    <>
      <PageHead title={d?.sport.name || 'Sport'}>{d?.sport.description}</PageHead>
      <div className="wrap section">
        <Link to="/sports" className="link-more">&larr; All sports</Link>
        <div style={{ marginTop: '1rem' }}>
          <Async state={{ ...s, reload: () => window.location.reload() }}>{(d) => {
            const f = d.matches.filter((m) => (!team || [m.team1.id, m.team2.id].includes(Number(team))) && (!status || (status === 'upcoming' ? ['scheduled', 'upcoming', 'postponed', 'cancelled'].includes(m.status) : m.status === status)));
            const live = f.filter((m) => m.status === 'live');
            const up = f.filter((m) => ['scheduled', 'upcoming', 'postponed', 'cancelled'].includes(m.status));
            const done = f.filter((m) => m.status === 'completed').reverse();
            const hasBracket = d.rounds.some((r) => d.matches.some((m) => m.round?.id === r.id));
            const tabs = [['matches', 'Matches'], ['teams', 'Teams'], ['standings', 'Points table'], ...(hasBracket ? [['bracket', 'Bracket']] : []), ['photos', 'Photos']];
            return (
              <>
                {d.winners.length > 0 && <div className="card" style={{ marginBottom: '1rem', borderTop: '6px solid var(--signal)' }}><h3>Champion{d.winners.length > 1 ? 's' : ''}</h3>{d.winners.map((w) => <p key={w.id} style={{ margin: 0 }}><strong>{w.year}: {w.champion}</strong>{w.runner_up && <span className="muted"> (runner-up {w.runner_up})</span>}</p>)}</div>}
                <div className="tabs" role="tablist" aria-label="Sport sections">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{l}</button>)}</div>
                {tab === 'matches' && (
                  <>
                    <div className="toolbar" style={{ marginTop: 0 }}>
                      <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team"><option value="">All teams</option>{d.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All matches</option><option value="live">Live</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option></select>
                    </div>
                    {f.length === 0 && <Empty>No matches match this filter yet.</Empty>}
                    {live.length > 0 && <><h3 style={{ margin: '1rem 0 .6rem' }}>Live</h3><div className="grid" style={{ gap: '1rem' }}>{live.map((m) => <Scoreboard key={m.id} m={m} fetchedAt={s.updatedAt} />)}</div></>}
                    {up.length > 0 && <><h3 style={{ margin: '1.4rem 0 .6rem' }}>Upcoming</h3><div className="grid g2">{up.map((m) => <MatchCard key={m.id} m={m} showSport={false} />)}</div></>}
                    {done.length > 0 && <><h3 style={{ margin: '1.4rem 0 .6rem' }}>Completed results</h3><div className="grid g2">{done.map((m) => <MatchCard key={m.id} m={m} showSport={false} />)}</div></>}
                  </>
                )}
                {tab === 'teams' && (d.teams.length ? <div className="grid g3">{d.teams.map((t) => <div className="card" key={t.id}><h3>{t.name}</h3>{t.description && <p className="muted">{t.description}</p>}</div>)}</div> : <Empty>No teams have been added to this sport yet.</Empty>)}
                {tab === 'standings' && (d.standings ? (
                  <div className="tbl-wrap"><table><caption className="sr">Points table for {d.sport.name}</caption><thead><tr><th>Team</th><th className="num">Played</th><th className="num">Won</th>{d.sport.allow_draw && <th className="num">Drawn</th>}<th className="num">Lost</th><th className="num">For</th><th className="num">Against</th><th className="num">Points</th></tr></thead>
                    <tbody>{d.standings.map((r) => <tr key={r.team.id}><td><strong>{r.team.name}</strong></td><td className="num">{r.played}</td><td className="num">{r.won}</td>{d.sport.allow_draw && <td className="num">{r.drawn}</td>}<td className="num">{r.lost}</td><td className="num">{r.for}</td><td className="num">{r.against}</td><td className="num"><strong>{r.points}</strong></td></tr>)}</tbody></table></div>
                ) : <Empty>A points table is not used for this sport yet. The organisers can switch it on and set the points rules.</Empty>)}
                {tab === 'bracket' && <Bracket rounds={d.rounds} matches={d.matches} />}
                {tab === 'photos' && (d.photos.length ? <PhotoGrid photos={d.photos} /> : <Empty>No photos for this sport yet.</Empty>)}
              </>
            );
          }}</Async>
        </div>
      </div>
    </>
  );
}
