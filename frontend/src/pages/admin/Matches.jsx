import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAsync, usePageTitle } from '../../services/hooks';
import { Async, Field, ImageField, StatusBadge, useConfirm, useAction } from '../../components/ui';
import { AdminHead, FormModal, useForm } from './shared';
import { fmtShortDate, fmtTime, STATUS_LABEL, todayISO } from '../../services/format';

const EDITABLE = ['scheduled', 'upcoming', 'postponed', 'cancelled'];

function MatchForm({ match, sports, onClose, onDone }) {
  const [v, setV, bind] = useForm({ sport_id: match?.sport.id || '', match_type: match?.match_type || '', date: match?.date || todayISO(), time: match?.time || '16:00', venue: match?.venue || '',
    team1_id: match?.team1.id || '', team2_id: match?.team2.id || '', round_id: match?.round?.id || '', match_number: match?.match_number || '', status: match?.status || 'scheduled', notes: match?.notes || '' });
  const [poster, setPoster] = useState(match?.poster_url || null);
  const locked = match && ['live', 'completed'].includes(match.status);
  const slug = sports.find((s) => String(s.id) === String(v.sport_id))?.slug;
  const d = useAsync(() => (slug ? api.get(`/sports/${slug}`) : Promise.resolve(null)), [slug]);
  const teams = d.data?.teams || [], rounds = d.data?.rounds || [];
  const save = async () => { const b = { ...v, poster_url: poster }; if (locked) delete b.status; await (match ? api.patch(`/matches/${match.id}`, b) : api.post('/matches', b)); onDone(); };
  const validate = () => (!v.sport_id ? 'Choose a sport.' : !v.team1_id || !v.team2_id ? 'Choose both teams.' : v.team1_id === v.team2_id ? 'A team cannot play against itself.' : !v.date || !v.time ? 'Enter the date and time.' : '');
  return (
    <FormModal title={match ? 'Edit match' : 'Create match'} onClose={onClose} onSave={save} validate={validate}>
      <Field label="Sport"><select {...bind('sport_id')} disabled={locked} onChange={(e) => setV({ ...v, sport_id: e.target.value, team1_id: '', team2_id: '', round_id: '' })}><option value="">Choose…</option>{sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Match type" hint="e.g. Semi Final, League match"><input {...bind('match_type')} maxLength={60} /></Field>
      <Field label="Team 1"><select {...bind('team1_id')} disabled={locked}><option value="">{slug ? 'Choose…' : 'Choose a sport first'}</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      <Field label="Team 2"><select {...bind('team2_id')} disabled={locked}><option value="">{slug ? 'Choose…' : 'Choose a sport first'}</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      {slug && teams.length < 2 && (
        <div className="err" style={{ gridColumn: '1/-1', padding: '0.6rem 0.8rem', borderRadius: '6px', background: '#fee2e2', color: '#991b1b', lineHeight: '1.4' }}>
          This sport currently has <strong>{teams.length}</strong> team{teams.length === 1 ? '' : 's'} assigned to it.
          Matches require at least 2 teams.
          <br />
          👉 Go to the <Link to="/admin/sports" onClick={onClose} style={{ textDecoration: 'underline', fontWeight: 600, color: '#7f1d1d' }}>Sports page</Link> and click the <strong>"Teams"</strong> button on {sports.find((s) => String(s.id) === String(v.sport_id))?.name || 'this sport'} to select participating teams.
        </div>
      )}
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Time"><input type="time" {...bind('time')} /></Field>
      <Field label="Venue"><input {...bind('venue')} maxLength={120} /></Field>
      <Field label="Round (optional)" hint="Rounds are set up under Tournament Brackets"><select {...bind('round_id')}><option value="">No round</option>{rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      <Field label="Match number (optional)"><input type="number" min="1" {...bind('match_number')} /></Field>
      {!locked && <Field label="Status"><select {...bind('status')}>{EDITABLE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></Field>}
      <Field label="Notes (optional)"><textarea {...bind('notes')} maxLength={1000} /></Field>
      <ImageField label="Match poster (optional)" value={poster} onChange={setPoster} />
    </FormModal>
  );
}

// Used for both entering a result for a match that was never live and editing a completed result.
export function ResultForm({ match, onClose, onDone }) {
  const sets = match.sport.scoring_type === 'sets';
  const [v, , bind] = useForm({ team1: match.score?.team1 ?? 0, team2: match.score?.team2 ?? 0, winner: match.winner?.id || '', summary: match.summary || '' });
  const [rows, setRows] = useState(match.sets.length ? match.sets.map((s) => ({ ...s, finished: true })) : [{ set: 1, team1: 0, team2: 0, finished: true }]);
  const upd = (i, k, val) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  const save = async () => { await api.post(`/matches/${match.id}/complete`, { ...(sets ? { sets: rows.map((r, i) => ({ set: i + 1, team1: Number(r.team1), team2: Number(r.team2), finished: true })) } : { team1: v.team1, team2: v.team2 }), winner_team_id: v.winner || undefined, summary: v.summary }); onDone(); };
  return (
    <FormModal title={`Result: ${match.team1.name} vs ${match.team2.name}`} onClose={onClose} onSave={save} saveLabel="Publish result">
      {sets ? <div style={{ gridColumn: '1/-1' }}>{rows.map((r, i) => (
        <div key={i} className="row" style={{ marginBottom: '.5rem' }}><strong style={{ flex: '0 0 50px', alignSelf: 'center' }}>Set {i + 1}</strong>
          <Field label={match.team1.name}><input type="number" min="0" value={r.team1} onChange={(e) => upd(i, 'team1', e.target.value)} /></Field>
          <Field label={match.team2.name}><input type="number" min="0" value={r.team2} onChange={(e) => upd(i, 'team2', e.target.value)} /></Field>
          {rows.length > 1 && <button type="button" className="btn sm ghost" style={{ flex: '0 0 auto' }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>}</div>))}
        <button type="button" className="btn sm ghost" disabled={rows.length >= (match.sport.config.max_sets || 5)} onClick={() => setRows([...rows, { set: rows.length + 1, team1: 0, team2: 0, finished: true }])}>Add set</button></div>
        : <><Field label={`${match.team1.name} score`}><input type="number" min="0" {...bind('team1')} /></Field><Field label={`${match.team2.name} score`}><input type="number" min="0" {...bind('team2')} /></Field></>}
      <Field label="Winner" hint="Leave on automatic to use the higher score. Choose a team only for tie-breaks."><select {...bind('winner')}><option value="">Automatic</option><option value={match.team1.id}>{match.team1.name}</option><option value={match.team2.id}>{match.team2.name}</option></select></Field>
      <Field label="Match summary (optional)"><textarea {...bind('summary')} maxLength={1500} /></Field>
    </FormModal>
  );
}

export default function MatchesAdmin({ mode }) {
  const results = mode === 'results';
  usePageTitle(results ? 'Manage Results' : 'Manage Matches');
  const m = useAsync(() => api.get(results ? '/matches?bucket=results' : '/matches?bucket=schedule'), [mode]);
  const sports = useAsync(() => api.get('/sports?all=1'), []);
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({ q: '', sport: '', status: '' });
  const confirm = useConfirm(); const act = useAction();
  useEffect(() => { setF({ q: '', sport: '', status: '' }); }, [mode]);
  const remove = async (x) => { if (await confirm({ title: 'Delete this match?', message: `${x.sport.name}: ${x.team1.name} vs ${x.team2.name}. Its scores, events and result will be removed. This cannot be undone.` })) act(async () => { await api.del(`/matches/${x.id}`); m.reload(); }, 'Match deleted'); };
  const start = (x) => act(async () => { await api.post(`/matches/${x.id}/live`, { action: 'start' }); m.reload(); }, 'Match is now live. Open Live Matches to update the score.');
  const reopen = async (x) => { if (await confirm({ title: 'Reopen this result?', message: 'The final score and winner are cleared and the match goes back to Scheduled.', confirmLabel: 'Reopen' })) act(async () => { await api.patch(`/matches/${x.id}`, { status: 'scheduled' }); m.reload(); }, 'Result reopened'); };
  const setStatus = (x, status) => act(async () => { await api.patch(`/matches/${x.id}`, { status }); m.reload(); }, `Marked ${STATUS_LABEL[status].toLowerCase()}`);
  return (
    <>
      <AdminHead title={results ? 'Results' : 'Upcoming matches'} action={!results && <button className="btn" onClick={() => setModal({ kind: 'form' })}>Create match</button>}>
        {results ? 'Completed matches. Results appear on the public site automatically.' : 'Create, reschedule and start matches. Enter a result here for matches that were not scored live.'}</AdminHead>
      <div className="toolbar">
        <input placeholder="Search teams or venue" aria-label="Search matches" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="Filter by sport" value={f.sport} onChange={(e) => setF({ ...f, sport: e.target.value })}><option value="">All sports</option>{(sports.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        {!results && <select aria-label="Filter by status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All statuses</option>{EDITABLE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>}
      </div>
      <Async state={m} empty={results ? 'No completed matches yet.' : 'No matches scheduled yet. Create the first one.'}>{(list) => {
        const q = f.q.toLowerCase();
        const rows = list.filter((x) => (!f.sport || String(x.sport.id) === f.sport) && (!f.status || x.status === f.status) && (!q || `${x.team1.name} ${x.team2.name} ${x.venue || ''} ${x.sport.name}`.toLowerCase().includes(q)));
        return rows.length ? (
          <div className="tbl-wrap"><table><thead><tr><th>When</th><th>Sport</th><th>Match</th>{results && <th>Score</th>}<th>Status</th><th /></tr></thead><tbody>{rows.map((x) => (
            <tr key={x.id}><td>{fmtShortDate(x.date)}<br /><span className="muted small">{fmtTime(x.time)}</span></td><td>{x.sport.name}<br /><span className="muted small">{x.round?.name || x.match_type || ''}</span></td>
              <td><strong>{x.team1.name} vs {x.team2.name}</strong></td>
              {results && <td>{x.score ? `${x.score.team1} - ${x.score.team2}` : ''}<br /><span className="muted small">{x.winner ? `Winner: ${x.winner.name}` : 'Draw'}</span></td>}
              <td><StatusBadge status={x.status} /></td>
              <td className="actions">{results ? <><button className="btn sm ghost" onClick={() => setModal({ kind: 'result', x })}>Edit result</button> <button className="btn sm ghost" onClick={() => reopen(x)}>Reopen</button></> : <>
                {x.status !== 'cancelled' && <button className="btn sm" onClick={() => start(x)}>Start live</button>} <button className="btn sm ghost" onClick={() => setModal({ kind: 'result', x })}>Enter result</button>
                {x.status !== 'postponed' && x.status !== 'cancelled' && <> <button className="btn sm ghost" onClick={() => setStatus(x, 'postponed')}>Postpone</button></>}
                {x.status === 'postponed' || x.status === 'cancelled' ? <> <button className="btn sm ghost" onClick={() => setStatus(x, 'scheduled')}>Reschedule</button></> : null}
                {x.status !== 'cancelled' && <> <button className="btn sm ghost" onClick={() => setStatus(x, 'cancelled')}>Cancel</button></>}
                {' '}<button className="btn sm ghost" onClick={() => setModal({ kind: 'form', x })}>Edit</button></>} <button className="btn sm danger" onClick={() => remove(x)}>Delete</button></td></tr>))}</tbody></table></div>
        ) : <div className="state">No matches fit these filters.</div>; }}</Async>
      {modal?.kind === 'form' && sports.data && <MatchForm match={modal.x} sports={sports.data.filter((s) => s.active)} onClose={() => setModal(null)} onDone={m.reload} />}
      {modal?.kind === 'result' && <ResultForm match={modal.x} onClose={() => setModal(null)} onDone={() => { m.reload(); }} />}
    </>
  );
}
