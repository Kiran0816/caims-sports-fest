import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAsync, usePageTitle } from '../../services/hooks';
import { Async, Empty, Field, Modal, StatusBadge, useAction } from '../../components/ui';
import { AdminHead } from './shared';
import { fmtClock, fmtShortDate, fmtTime, ago } from '../../services/format';

function Stepper({ value, onChange, label }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button className="btn" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Decrease ${label}`}>-</button>
      <b aria-live="polite">{value}</b>
      <button className="btn" onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

function EndModal({ m, onClose, onEnd }) {
  const [winner, setWinner] = useState(''); const [summary, setSummary] = useState(m.summary || ''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(''); try { await onEnd({ winner_team_id: winner || undefined, summary }); onClose(); } catch (e) { setErr(e.message); setBusy(false); } };
  return (
    <Modal title="End this match?" onClose={onClose}>
      <p>Final score: <strong>{m.team1.name} {m.score.team1} - {m.score.team2} {m.team2.name}</strong>. This publishes the result.</p>
      <div className="form-grid">
        <Field label="Winner" hint="Automatic uses the higher score. Choose a team only for a tie-break."><select value={winner} onChange={(e) => setWinner(e.target.value)}><option value="">Automatic</option><option value={m.team1.id}>{m.team1.name}</option><option value={m.team2.id}>{m.team2.name}</option></select></Field>
        <Field label="Match summary (optional)"><textarea value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1500} /></Field></div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions"><button className="btn ghost" onClick={onClose}>Keep playing</button><button className="btn green" disabled={busy} onClick={go}>End match and publish result</button></div>
    </Modal>
  );
}

function Panel({ initial, onChange }) {
  const act = useAction();
  const [m, setM] = useState(initial);
  const [at, setAt] = useState(initial._at || Date.now());
  const sets = m.sport.scoring_type === 'sets';
  const [draft, setDraft] = useState({ team1: m.score?.team1 ?? 0, team2: m.score?.team2 ?? 0, period: m.period || '', sets: m.sets });
  const [dirty, setDirty] = useState(false);
  const [adjust, setAdjust] = useState('');
  const [end, setEnd] = useState(false);
  const [ev, setEv] = useState({ minute: '', type: 'goal', team_id: '', description: '' });
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const sync = (nm) => { setM(nm); setAt(Date.now()); };
  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const cur = draft.sets.find((s) => !s.finished);
  const setCur = (k, val) => set({ sets: draft.sets.map((s) => (s === cur ? { ...s, [k]: val } : s)) });
  const finishSet = () => {
    if (!cur || cur.team1 === cur.team2) return act(async () => { throw new Error('A set cannot finish tied. Adjust the score first.'); });
    const max = m.sport.config.max_sets || 5;
    const next = draft.sets.map((s) => (s === cur ? { ...s, finished: true } : s));
    set({ sets: draft.sets.length < max ? [...next, { set: cur.set + 1, team1: 0, team2: 0, finished: false }] : next });
  };
  const parseClock = (t) => { const p = t.split(':').map(Number); if (p.some((x) => Number.isNaN(x))) return undefined; return p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60; };
  const save = () => act(async () => {
    const body = sets ? { sets: draft.sets } : { team1: draft.team1, team2: draft.team2, period: draft.period };
    if (adjust.trim()) { const s = parseClock(adjust.trim()); if (s === undefined) throw new Error('Enter match time as mm:ss, for example 72:14.'); body.clock_seconds = s; }
    sync(await api.put(`/matches/${m.id}/score`, body)); setDirty(false); setAdjust('');
  }, 'Score saved');
  const live = (action) => act(async () => { sync(await api.post(`/matches/${m.id}/live`, { action })); }, action === 'pause' ? 'Clock paused' : 'Clock running');
  const addEvent = () => act(async () => { await api.post(`/matches/${m.id}/events`, ev); setEv({ ...ev, minute: '', description: '' }); sync(await api.get(`/matches/${m.id}`)); }, 'Event added');
  const delEvent = (id) => act(async () => { await api.del(`/matches/${m.id}/events/${id}`); sync(await api.get(`/matches/${m.id}`)); });
  const periods = m.sport.config.periods || [];
  return (
    <section className="lc" aria-label={`${m.sport.name} live control`}>
      <div className="lc-head"><div><h3>{m.sport.name}</h3><span className="muted small">{[m.round?.name || m.match_type, m.venue].filter(Boolean).join(' • ')}</span></div><StatusBadge status="live" /></div>
      <div className="lc-teams">
        {[['team1', m.team1], ['team2', m.team2]].map(([k, t]) => (
          <div className="lc-team" key={k}><h4>{t.name}</h4>
            {sets ? <div className="lc-num">{m.score?.[k] ?? 0}</div> : <div className="lc-num">{draft[k]}</div>}
            {sets ? <div className="small muted">sets won</div> : (
              <div className="lc-btns"><button className="btn" onClick={() => set({ [k]: Math.max(0, draft[k] - 1) })} aria-label={`Minus one for ${t.name}`}>-</button><button className="btn" onClick={() => set({ [k]: draft[k] + 1 })} aria-label={`Plus one for ${t.name}`}>+</button></div>)}
          </div>))}
      </div>
      {sets ? (
        <div style={{ marginTop: '1rem' }}>
          {draft.sets.map((s) => (
            <div key={s.set} className={`lc-set${s === cur ? ' cur' : ''}`}><strong>Set {s.set}</strong>
              {s === cur ? <><Stepper label={`${m.team1.name} points`} value={s.team1} onChange={(v) => setCur('team1', v)} /><Stepper label={`${m.team2.name} points`} value={s.team2} onChange={(v) => setCur('team2', v)} /><button className="btn sm green" onClick={finishSet}>Finish set</button></>
                : <><span style={{ textAlign: 'center', fontSize: '1.3rem' }}>{s.team1}</span><span style={{ textAlign: 'center', fontSize: '1.3rem' }}>{s.team2}</span><span className="muted small">Done</span></>}</div>))}
          {!cur && <p className="muted small">All sets are finished. End the match or save to publish the score.</p>}
        </div>
      ) : periods.length > 0 ? (
        <div style={{ marginTop: '1rem' }}><Field label="Period"><select value={draft.period} onChange={(e) => set({ period: e.target.value })}><option value="">-</option>{periods.map((p) => <option key={p}>{p}</option>)}</select></Field></div>
      ) : null}
      {m.clock.enabled && (
        <div className="row" style={{ marginTop: '1rem' }}>
          <div><span className="muted small">Match time</span><div style={{ fontFamily: 'var(--display)', fontSize: '2rem', fontWeight: 800 }}>{fmtClock(liveSeconds(m, at))}{!m.clock.running && ' (paused)'}</div></div>
          <Field label="Set time (mm:ss)" hint="Optional correction"><input value={adjust} onChange={(e) => { setAdjust(e.target.value); setDirty(true); }} placeholder="72:14" inputMode="numeric" /></Field>
          <div style={{ flex: '0 0 auto' }}>{m.clock.running ? <button className="btn" onClick={() => live('pause')}>Pause</button> : <button className="btn" onClick={() => live('resume')}>Resume</button>}</div>
        </div>)}
      <div className="lc-actions">
        <button className="btn signal" onClick={save} disabled={!dirty} style={{ flex: '2 1 200px' }}>Save update</button>
        <button className="btn danger" onClick={() => (dirty ? act(async () => { throw new Error('Save your changes before ending the match.'); }) : setEnd(true))}>End match</button>
      </div>
      <p className="small" style={{ margin: '.6rem 0 0' }}>{dirty ? <span className="dirty">Unsaved changes. The public page still shows the old score.</span> : <span className="muted">Last updated {ago(m.updated_at)}. Public pages refresh within 5 seconds.</span>}</p>
      <details style={{ marginTop: '1rem' }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Match events ({m.events?.length || 0})</summary>
        <div className="row" style={{ margin: '.7rem 0' }}>
          <Field label="Minute"><input value={ev.minute} onChange={(e) => setEv({ ...ev, minute: e.target.value })} placeholder="72'" /></Field>
          <Field label="Type"><select value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })}><option value="goal">Goal / score</option><option value="card">Card</option><option value="foul">Foul</option><option value="timeout">Timeout</option><option value="note">Note</option></select></Field>
          <Field label="Team"><select value={ev.team_id} onChange={(e) => setEv({ ...ev, team_id: e.target.value })}><option value="">None</option><option value={m.team1.id}>{m.team1.name}</option><option value={m.team2.id}>{m.team2.name}</option></select></Field>
          <Field label="Description"><input value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} maxLength={200} /></Field>
          <button className="btn" style={{ flex: '0 0 auto' }} disabled={!ev.description.trim()} onClick={addEvent}>Add event</button></div>
        <ul>{(m.events || []).map((e) => <li key={e.id}>{e.minute && <b>{e.minute} </b>}{e.description} <button className="btn sm ghost" onClick={() => delEvent(e.id)} aria-label={`Delete event ${e.description}`}>Remove</button></li>)}</ul></details>
      {end && <EndModal m={{ ...m, score: m.score || { team1: 0, team2: 0 } }} onClose={() => setEnd(false)} onEnd={async (b) => { await api.post(`/matches/${m.id}/complete`, b); onChange?.(); }} />}
    </section>
  );
}
function liveSeconds(m, at) { return m.clock.seconds + (m.clock.running ? Math.floor((Date.now() - at) / 1000) : 0); }

export default function LiveAdmin() {
  usePageTitle('Live Matches (Admin)');
  const live = useAsync(async () => { const l = await api.get('/matches/live'); const at = Date.now(); return l.map((m) => ({ ...m, _at: at })); }, []);
  const sched = useAsync(() => api.get('/matches?bucket=schedule'), []);
  const act = useAction();
  const start = (x) => act(async () => { await api.post(`/matches/${x.id}/live`, { action: 'start' }); live.reload(); sched.reload(); }, `${x.team1.name} vs ${x.team2.name} is live`);
  const refresh = () => { live.reload(); sched.reload(); };
  return (
    <>
      <AdminHead title="Live matches">Update scores here. Visitors see changes within 5 seconds.</AdminHead>
      <Async state={live}>{(list) => list.length ? list.map((m) => <Panel key={m.id} initial={{ ...m, _at: m._at }} onChange={refresh} />) : <Empty>No match is live. Start one from the list below.</Empty>}</Async>
      <h3 style={{ margin: '1.6rem 0 .6rem' }}>Start a match</h3>
      <Async state={sched} empty="No scheduled matches. Create one under Upcoming Matches.">{(list) => (
        <div className="tbl-wrap"><table><tbody>{list.filter((x) => ['scheduled', 'upcoming', 'postponed'].includes(x.status)).map((x) => (
          <tr key={x.id}><td>{fmtShortDate(x.date)} {fmtTime(x.time)}</td><td>{x.sport.name}</td><td><strong>{x.team1.name} vs {x.team2.name}</strong></td><td className="actions"><button className="btn sm" onClick={() => start(x)}>Start live</button></td></tr>))}</tbody></table></div>)}</Async>
    </>
  );
}
