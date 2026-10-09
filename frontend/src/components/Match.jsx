import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from './ui';
import { fmtDate, fmtTime, fmtClock, ago } from '../services/format';

export function MatchCard({ m, showSport = true }) {
  const done = m.status === 'completed';
  return (
    <Link to={`/matches/${m.id}`} className={`mc ${m.status}`} aria-label={`${m.sport.name}: ${m.team1.name} versus ${m.team2.name}, ${m.status}`}>
      <div className="mc-top">
        <span className="mc-sport">{showSport ? m.sport.name : (m.match_type || m.round?.name || 'Match')}</span>
        <StatusBadge status={m.status} />
      </div>
      {showSport && (m.match_type || m.round) && <div className="small muted" style={{ marginTop: -8, marginBottom: 8 }}>{[m.match_type, m.round?.name, m.match_number && `Match ${m.match_number}`].filter(Boolean).join(' • ')}</div>}
      <div className="mc-teams">
        <span className={`mc-team${done && m.winner?.id === m.team1.id ? ' win' : ''}`}>{m.team1.name}</span>
        {m.score && ['live', 'completed'].includes(m.status) ? <span className="mc-score">{m.score.team1} - {m.score.team2}</span> : <span className="mc-vs">vs</span>}
        <span className={`mc-team${done && m.winner?.id === m.team2.id ? ' win' : ''}`}>{m.team2.name}</span>
      </div>
      {m.sets.length > 0 && <div className="sets-line">{m.sets.map((s) => `${s.team1}-${s.team2}`).join('  |  ')}</div>}
      <div className="mc-meta"><span>{fmtDate(m.date)}</span><span>{fmtTime(m.time)}</span>{m.venue && <span>{m.venue}</span>}</div>
      {done && <div className="mc-meta"><strong style={{ color: 'var(--done)' }}>{m.winner ? `Winner: ${m.winner.name}` : 'Result: draw'}</strong></div>}
      {m.notes && m.status !== 'completed' && <div className="mc-note">{m.notes}</div>}
    </Link>
  );
}

// Big live scoreboard. `fetchedAt` lets the match clock tick smoothly between polls.
export function Scoreboard({ m, fetchedAt }) {
  const [, tick] = useState(0);
  useEffect(() => { if (!m.clock.running) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [m.clock.running]);
  const extra = m.clock.running && fetchedAt ? Math.floor((Date.now() - fetchedAt.getTime()) / 1000) : 0;
  const unit = m.sport.config.unit_label;
  return (
    <article className="sb" aria-label={`${m.sport.name} live score`}>
      <div className="sb-top">
        <div><div className="sb-sport">{m.sport.name}</div><div className="sb-round">{[m.round?.name || m.match_type, m.venue].filter(Boolean).join(' • ')}</div></div>
        <StatusBadge status="live" />
      </div>
      <div className="sb-main">
        <div className="sb-team">{m.team1.name}</div>
        <div className="sb-score" aria-label={`Score ${m.score?.team1 ?? 0} to ${m.score?.team2 ?? 0}`}><span>{m.score?.team1 ?? 0}</span><span className="d">-</span><span>{m.score?.team2 ?? 0}</span></div>
        <div className="sb-team">{m.team2.name}</div>
      </div>
      {unit && <div className="sets-line" style={{ color: '#C8D4E8', marginTop: 0 }}>{unit}</div>}
      <div className="sb-info">
        {m.period && <span>{m.period}</span>}
        {m.clock.enabled && <span className="sb-clock" aria-label="Match time">{fmtClock(m.clock.seconds + extra)}{!m.clock.running && ' (paused)'}</span>}
      </div>
      {m.sets.length > 0 && (
        <div className="sb-sets" aria-label="Set scores">{m.sets.map((s) => (
          <div key={s.set} className={`sb-set${s.finished ? '' : ' cur'}`}><small>Set {s.set}{s.finished ? '' : ' (now)'}</small><b>{s.team1} - {s.team2}</b></div>
        ))}</div>
      )}
      {m.events?.length > 0 && <ul className="events" aria-label="Match events">{m.events.slice(0, 6).map((e) => <li key={e.id}><b>{e.minute}</b>{e.description}</li>)}</ul>}
      <div className="sb-foot"><span>Last updated {ago(m.updated_at)}</span>{m.notes && <span>{m.notes}</span>}</div>
    </article>
  );
}
