import { useState } from 'react';
import { api } from '../../services/api';
import { useAsync, usePageTitle } from '../../services/hooks';
import { Async, Field, ImageField, useConfirm, useAction } from '../../components/ui';
import { AdminHead, FormModal, ToggleModal, useForm } from './shared';

function SportForm({ sport, onClose, onDone }) {
  const cfg = sport?.scoring_config || {};
  const [v, , bind, check] = useForm({ name: sport?.name || '', gender: sport?.gender || 'open', scoring_type: sport?.scoring_type || 'simple', clock: !!cfg.clock, unit_label: cfg.unit_label || '',
    periods: (cfg.periods || []).join(', '), max_sets: cfg.max_sets || 5, points_enabled: !!sport?.points_enabled, points_win: sport?.points_win ?? 0, points_draw: sport?.points_draw ?? 0,
    points_loss: sport?.points_loss ?? 0, allow_draw: !!sport?.allow_draw, has_bracket: !!sport?.has_bracket, description: sport?.description || '', active: sport ? !!sport.active : true });
  const [img, setImg] = useState(sport?.image_url || null);
  const save = () => {
    const body = { name: v.name, gender: v.gender, scoring_type: v.scoring_type, description: v.description, image_url: img, points_enabled: v.points_enabled, points_win: v.points_win, points_draw: v.points_draw,
      points_loss: v.points_loss, allow_draw: v.allow_draw, has_bracket: v.has_bracket, active: v.active,
      scoring_config: { clock: v.clock, unit_label: v.unit_label, periods: v.periods.split(',').map((x) => x.trim()).filter(Boolean), max_sets: v.scoring_type === 'sets' ? Number(v.max_sets) : undefined } };
    return sport ? api.patch(`/sports/${sport.id}`, body) : api.post('/sports', body);
  };
  return (
    <FormModal title={sport ? `Edit ${sport.name}` : 'Add a sport'} onClose={onClose} onSave={async () => { await save(); onDone(); }} validate={() => (!v.name.trim() ? 'Enter a sport name.' : '')}>
      <Field label="Sport name"><input {...bind('name')} maxLength={80} /></Field>
      <Field label="Category"><select {...bind('gender')}><option value="men">Men</option><option value="women">Women</option><option value="open">Open / mixed</option></select></Field>
      <Field label="Scoring format" hint="Simple = one running score (goals, points). Sets = set-by-set scoring (volleyball).">
        <select {...bind('scoring_type')}><option value="simple">Simple score</option><option value="sets">Set-based</option></select></Field>
      <Field label="Score label" hint="Shown under the score, e.g. Goals, Points, Pulls won"><input {...bind('unit_label')} maxLength={30} /></Field>
      {v.scoring_type === 'sets' ? <Field label="Maximum sets"><input type="number" min="1" max="9" {...bind('max_sets')} /></Field>
        : <Field label="Periods" hint="Comma separated, e.g. 1st Half, 2nd Half"><input {...bind('periods')} /></Field>}
      <label className="check"><input type="checkbox" {...check('clock')} />Show a match clock</label>
      <label className="check"><input type="checkbox" {...check('allow_draw')} />Matches can end in a draw</label>
      <label className="check"><input type="checkbox" {...check('has_bracket')} />Uses a knockout bracket</label>
      <label className="check"><input type="checkbox" {...check('points_enabled')} />Show a points table</label>
      {v.points_enabled && <>
        <Field label="Points for a win"><input type="number" min="0" {...bind('points_win')} /></Field>
        <Field label="Points for a draw"><input type="number" min="0" {...bind('points_draw')} /></Field>
        <Field label="Points for a loss"><input type="number" min="0" {...bind('points_loss')} /></Field></>}
      <Field label="Description"><textarea {...bind('description')} maxLength={1000} /></Field>
      <ImageField label="Sport image" value={img} onChange={setImg} />
      <label className="check"><input type="checkbox" {...check('active')} />Visible on the public site</label>
    </FormModal>
  );
}

export function SportsAdmin() {
  usePageTitle('Manage Sports');
  const s = useAsync(() => api.get('/sports?all=1'), []);
  const teams = useAsync(() => api.get('/teams'), []);
  const [modal, setModal] = useState(null);
  const confirm = useConfirm(); const act = useAction();
  const remove = async (sp) => {
    if (await confirm({ title: `Delete ${sp.name}?`, message: 'This removes the sport and its team entries. Sports that already have matches or winners cannot be deleted.' }))
      act(async () => { await api.del(`/sports/${sp.id}`); s.reload(); }, 'Sport deleted');
  };
  const detail = async (sp) => { const d = await api.get(`/sports/${sp.slug}`).catch(() => ({ teams: [] })); setModal({ kind: 'teams', sp, ids: d.teams.map((t) => t.id) }); };
  return (
    <>
      <AdminHead title="Sports" action={<button className="btn" onClick={() => setModal({ kind: 'form' })}>Add sport</button>}>Each sport has its own scoring format and teams.</AdminHead>
      <Async state={s} empty="No sports yet. Add one to get started.">{(list) => (
        <div className="tbl-wrap" style={{ marginTop: '1rem' }}><table><thead><tr><th>Sport</th><th>Scoring</th><th className="num">Teams</th><th>Visible</th><th /></tr></thead><tbody>
          {list.map((sp) => <tr key={sp.id}><td><strong>{sp.name}</strong></td><td>{sp.scoring_type === 'sets' ? 'Set-based' : 'Simple score'}{sp.points_enabled ? ', points table' : ''}</td><td className="num">{sp.team_count}</td><td>{sp.active ? 'Yes' : 'Hidden'}</td>
            <td className="actions"><button className="btn sm ghost" onClick={() => detail(sp)}>Teams</button> <button className="btn sm ghost" onClick={() => setModal({ kind: 'form', sp })}>Edit</button> <button className="btn sm danger" onClick={() => remove(sp)}>Delete</button></td></tr>)}
        </tbody></table></div>)}</Async>
      {modal?.kind === 'form' && <SportForm sport={modal.sp} onClose={() => setModal(null)} onDone={() => { s.reload(); }} />}
      {modal?.kind === 'teams' && teams.data && <ToggleModal title={`Teams in ${modal.sp.name}`} intro="Tick the teams that take part in this sport. Changes save immediately." items={teams.data} checked={modal.ids}
        onToggle={(id, on) => (on ? api.post(`/sports/${modal.sp.id}/teams`, { team_id: id }) : api.del(`/sports/${modal.sp.id}/teams/${id}`))} onClose={() => { setModal(null); s.reload(); }} />}
    </>
  );
}

function TeamForm({ team, onClose, onDone }) {
  const [v, , bind] = useForm({ name: team?.name || '', description: team?.description || '' });
  const [logo, setLogo] = useState(team?.logo_url || null); const [photo, setPhoto] = useState(team?.photo_url || null);
  const save = async () => { const b = { ...v, logo_url: logo, photo_url: photo }; await (team ? api.patch(`/teams/${team.id}`, b) : api.post('/teams', b)); onDone(); };
  return (
    <FormModal title={team ? `Edit ${team.name}` : 'Add a team'} onClose={onClose} onSave={save} validate={() => (!v.name.trim() ? 'Enter a team name.' : '')}>
      <Field label="Team name"><input {...bind('name')} maxLength={60} /></Field>
      <Field label="Description (optional)"><textarea {...bind('description')} maxLength={600} /></Field>
      <ImageField label="Team logo" value={logo} onChange={setLogo} /><ImageField label="Team photo" value={photo} onChange={setPhoto} />
    </FormModal>
  );
}
export function TeamsAdmin() {
  usePageTitle('Manage Teams');
  const t = useAsync(() => api.get('/teams'), []);
  const sports = useAsync(() => api.get('/sports?all=1'), []);
  const [modal, setModal] = useState(null); const [q, setQ] = useState('');
  const confirm = useConfirm(); const act = useAction();
  const remove = async (tm) => { if (await confirm({ title: `Delete ${tm.name}?`, message: 'The team is removed from every sport. Teams with match history cannot be deleted.' })) act(async () => { await api.del(`/teams/${tm.id}`); t.reload(); }, 'Team deleted'); };
  return (
    <>
      <AdminHead title="Teams" action={<button className="btn" onClick={() => setModal({ kind: 'form' })}>Add team</button>}>Teams only play in the sports you assign them to.</AdminHead>
      <div className="toolbar"><input placeholder="Search teams" aria-label="Search teams" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Async state={t} empty="No teams yet.">{(list) => { const f = list.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())); return f.length ? (
        <div className="tbl-wrap"><table><thead><tr><th>Team</th><th>Sports</th><th /></tr></thead><tbody>{f.map((tm) => (
          <tr key={tm.id}><td><strong>{tm.name}</strong></td><td>{tm.sports.map((s) => s.name).join(', ') || <span className="muted">None</span>}</td>
            <td className="actions"><button className="btn sm ghost" onClick={() => setModal({ kind: 'sports', tm })}>Sports</button> <button className="btn sm ghost" onClick={() => setModal({ kind: 'form', tm })}>Edit</button> <button className="btn sm danger" onClick={() => remove(tm)}>Delete</button></td></tr>))}</tbody></table></div>) : <div className="state">No teams match your search.</div>; }}</Async>
      {modal?.kind === 'form' && <TeamForm team={modal.tm} onClose={() => setModal(null)} onDone={t.reload} />}
      {modal?.kind === 'sports' && sports.data && <ToggleModal title={`Sports for ${modal.tm.name}`} intro="Tick the sports this team takes part in. Changes save immediately." items={sports.data} checked={modal.tm.sports.map((s) => s.id)}
        onToggle={(id, on) => (on ? api.post(`/sports/${id}/teams`, { team_id: modal.tm.id }) : api.del(`/sports/${id}/teams/${modal.tm.id}`))} onClose={() => { setModal(null); t.reload(); }} />}
    </>
  );
}
