import { Link } from 'react-router-dom';
import { fmtShortDate } from '../services/format';

// Optional knockout bracket: rounds are admin-defined; matches are assigned to rounds in the match form.
export function Bracket({ rounds, matches }) {
  const cols = rounds.map((r) => ({ r, ms: matches.filter((m) => m.round?.id === r.id) })).filter((c) => c.ms.length);
  if (!cols.length) return null;
  const last = cols[cols.length - 1].ms.find((m) => m.status === 'completed' && m.winner);
  return (
    <div className="bracket" role="group" aria-label="Tournament bracket">
      {cols.map(({ r, ms }) => (
        <div className="col" key={r.id}>
          <h4>{r.name}</h4>
          {ms.map((m) => (
            <Link key={m.id} to={`/matches/${m.id}`} style={{ textDecoration: 'none' }}>
              <div className="bm">
                {[m.team1, m.team2].map((t, i) => (
                  <div key={t.id} className={m.winner?.id === t.id ? 'w' : ''}><span>{t.name}</span><span>{m.score && ['live', 'completed'].includes(m.status) ? (i ? m.score.team2 : m.score.team1) : ''}</span></div>
                ))}
                <small>{m.status === 'completed' ? 'Final' : m.status === 'live' ? 'Live now' : `${fmtShortDate(m.date)}`}</small>
              </div>
            </Link>
          ))}
        </div>
      ))}
      {last && <div className="col"><h4>Champion</h4><div className="bm"><div className="w"><span>{last.winner.name}</span></div></div></div>}
    </div>
  );
}
