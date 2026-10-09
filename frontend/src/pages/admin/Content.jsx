import { useState } from 'react';
import { api } from '../../services/api';
import { useAsync, usePageTitle } from '../../services/hooks';
import { Async, Empty, Field, ImageField, StatusBadge, useAction, useConfirm, useToast } from '../../components/ui';
import { Bracket } from '../../components/Bracket';
import { AdminHead, FormModal, useForm } from './shared';
import { CATEGORIES, fmtDate, fmtShortDate } from '../../services/format';
import { useAuth } from '../../services/auth';

// ---------- Brackets ----------
export function BracketsAdmin() {
  usePageTitle('Tournament Brackets');
  const sports = useAsync(() => api.get('/sports?all=1'), []);
  const [slug, setSlug] = useState('');
  const d = useAsync(() => (slug ? api.get(`/sports/${slug}`) : Promise.resolve(null)), [slug]);
  const [name, setName] = useState(''); const [order, setOrder] = useState(1);
  const act = useAction(); const confirm = useConfirm();
  const addRound = (e) => { e.preventDefault(); act(async () => { await api.post('/rounds', { sport_id: d.data.sport.id, name, order_index: order }); setName(''); setOrder(Number(order) + 1); d.reload(); }, 'Round added'); };
  const delRound = async (r) => { if (await confirm({ title: `Delete round "${r.name}"?`, message: 'Matches in this round are kept but will no longer belong to a round.' })) act(async () => { await api.del(`/rounds/${r.id}`); d.reload(); }, 'Round deleted'); };
  const assign = (m, round_id) => act(async () => { await api.patch(`/matches/${m.id}`, { round_id }); d.reload(); }, 'Match moved');
  return (
    <>
      <AdminHead title="Tournament brackets">Optional. Create rounds for a sport (for example Quarter Final, Semi Final, Final), then assign matches to them.</AdminHead>
      <div className="toolbar"><select aria-label="Sport" value={slug} onChange={(e) => setSlug(e.target.value)}><option value="">Choose a sport…</option>{(sports.data || []).map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}</select></div>
      {!slug ? <Empty>Choose a sport to manage its rounds.</Empty> : <Async state={d}>{(x) => x && (
        <>
          <form className="row" onSubmit={addRound} style={{ marginBottom: '1rem' }}>
            <Field label="Round name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Semi Final" required maxLength={60} /></Field>
            <Field label="Order" hint="1 appears first"><input type="number" min="0" value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
            <button className="btn" style={{ flex: '0 0 auto' }}>Add round</button></form>
          {x.rounds.length === 0 ? <Empty>No rounds yet for {x.sport.name}.</Empty> : (
            <div className="tbl-wrap" style={{ marginBottom: '1.2rem' }}><table><thead><tr><th>Round</th><th className="num">Order</th><th className="num">Matches</th><th /></tr></thead><tbody>{x.rounds.map((r) => (
              <tr key={r.id}><td><strong>{r.name}</strong></td><td className="num">{r.order_index}</td><td className="num">{x.matches.filter((m) => m.round?.id === r.id).length}</td><td className="actions"><button className="btn sm danger" onClick={() => delRound(r)}>Delete</button></td></tr>))}</tbody></table></div>)}
          <h3 style={{ marginBottom: '.5rem' }}>Assign matches to rounds</h3>
          {x.matches.length === 0 ? <Empty>No matches for this sport yet.</Empty> : <div className="tbl-wrap"><table><tbody>{x.matches.map((m) => (
            <tr key={m.id}><td>{fmtShortDate(m.date)}</td><td><strong>{m.team1.name} vs {m.team2.name}</strong></td><td><StatusBadge status={m.status} /></td>
              <td><select aria-label={`Round for ${m.team1.name} vs ${m.team2.name}`} value={m.round?.id || ''} onChange={(e) => assign(m, e.target.value)}><option value="">No round</option>{x.rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td></tr>))}</tbody></table></div>}
          <h3 style={{ margin: '1.4rem 0 .5rem' }}>Preview</h3>
          {x.matches.some((m) => m.round) ? <Bracket rounds={x.rounds} matches={x.matches} /> : <Empty>Assign at least one match to a round to see the bracket.</Empty>}
        </>)}</Async>}
    </>
  );
}

// ---------- Gallery ----------
function PhotoForm({ photo, sports, onClose, onDone }) {
  const [v, setV, bind, check] = useForm({ caption: photo?.caption || '', category: photo?.category || 'other', sport_id: photo?.sport_id || '', match_id: photo?.match_id || '', featured: !!photo?.featured });
  const [file, setFile] = useState(null);
  const slug = sports.find((s) => String(s.id) === String(v.sport_id))?.slug;
  const matches = useAsync(() => (slug ? api.get(`/matches?sport=${slug}`) : Promise.resolve([])), [slug]);
  const save = async () => {
    if (photo) return api.patch(`/photos/${photo.id}`, v).then(onDone);
    const fd = new FormData(); Object.entries(v).forEach(([k, val]) => fd.append(k, val)); fd.append('image', file); await api.upload('/photos', fd); onDone();
  };
  return (
    <FormModal title={photo ? 'Edit photo' : 'Upload photo'} onClose={onClose} onSave={save} saveLabel={photo ? 'Save' : 'Upload'} validate={() => (!photo && !file ? 'Choose a photo to upload.' : '')}>
      {!photo && <Field label="Photo (JPG, PNG or WebP, up to 10 MB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files[0])} /></Field>}
      {photo && <img src={photo.thumb_url || photo.url} alt={photo.caption || 'Photo'} style={{ maxHeight: 160, borderRadius: 10 }} />}
      <Field label="Caption"><input {...bind('caption')} maxLength={200} /></Field>
      <Field label="Category"><select {...bind('category')}>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Sport (optional)"><select {...bind('sport_id')} onChange={(e) => setV({ ...v, sport_id: e.target.value, match_id: '' })}><option value="">None</option>{sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Match (optional)"><select {...bind('match_id')} disabled={!slug}><option value="">{slug ? 'None' : 'Choose a sport first'}</option>{(matches.data || []).map((m) => <option key={m.id} value={m.id}>{`${fmtShortDate(m.date)}: ${m.team1.name} vs ${m.team2.name}`}</option>)}</select></Field>
      <label className="check"><input type="checkbox" {...check('featured')} />Featured (shown on the home page)</label>
    </FormModal>
  );
}
export function GalleryAdmin() {
  usePageTitle('Manage Gallery');
  const p = useAsync(() => api.get('/photos?limit=500'), []);
  const sports = useAsync(() => api.get('/sports?all=1'), []);
  const [modal, setModal] = useState(null); const [cat, setCat] = useState('');
  const act = useAction(); const confirm = useConfirm();
  const del = async (x) => { if (await confirm({ title: 'Delete this photo?', message: 'The photo is permanently removed from the website.' })) act(async () => { await api.del(`/photos/${x.id}`); p.reload(); }, 'Photo deleted'); };
  const feat = (x) => act(async () => { await api.patch(`/photos/${x.id}`, { featured: !x.featured }); p.reload(); }, x.featured ? 'Removed from featured' : 'Marked as featured');
  return (
    <>
      <AdminHead title="Gallery" action={<button className="btn" onClick={() => setModal({})}>Upload photo</button>}>Photos are resized automatically for fast loading.</AdminHead>
      <div className="toolbar"><select aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <Async state={p} empty="No photos yet. Upload the first one.">{(list) => (
        <div className="grid g3">{list.filter((x) => !cat || x.category === cat).map((x) => (
          <div className="card" key={x.id}><img src={x.thumb_url || x.url} alt={x.caption || 'Photo'} loading="lazy" style={{ borderRadius: 10, aspectRatio: '4/3', objectFit: 'cover', width: '100%' }} />
            <p style={{ margin: '.6rem 0 .2rem' }}><strong>{x.caption || 'No caption'}</strong></p><p className="small muted">{CATEGORIES.find(([k]) => k === x.category)?.[1]}{x.featured ? ' • Featured' : ''}</p>
            <div className="chips"><button className="btn sm ghost" onClick={() => feat(x)}>{x.featured ? 'Unfeature' : 'Feature'}</button><button className="btn sm ghost" onClick={() => setModal({ photo: x })}>Edit</button><button className="btn sm danger" onClick={() => del(x)}>Delete</button></div></div>))}</div>)}</Async>
      {modal && sports.data && <PhotoForm photo={modal.photo} sports={sports.data} onClose={() => setModal(null)} onDone={() => { p.reload(); }} />}
    </>
  );
}

// ---------- Announcements ----------
function AnnForm({ a, onClose, onDone }) {
  const [v, , bind, check] = useForm({ title: a?.title || '', body: a?.body || '', priority: a?.priority || 'normal', published: a ? !!a.published : true });
  const [img, setImg] = useState(a?.image_url || null);
  return (
    <FormModal title={a ? 'Edit announcement' : 'New announcement'} onClose={onClose} validate={() => (!v.title.trim() ? 'Enter a title.' : '')}
      onSave={async () => { const b = { ...v, image_url: img }; await (a ? api.patch(`/announcements/${a.id}`, b) : api.post('/announcements', b)); onDone(); }}>
      <Field label="Title"><input {...bind('title')} maxLength={150} /></Field>
      <Field label="Message"><textarea {...bind('body')} maxLength={2000} /></Field>
      <Field label="Priority" hint="Important and urgent notices are shown on top of the home page."><select {...bind('priority')}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></Field>
      <ImageField label="Image (optional)" value={img} onChange={setImg} />
      <label className="check"><input type="checkbox" {...check('published')} />Published (visible to everyone)</label>
    </FormModal>
  );
}
export function AnnouncementsAdmin() {
  usePageTitle('Manage Announcements');
  const l = useAsync(() => api.get('/admin/announcements'), []);
  const [modal, setModal] = useState(null);
  const act = useAction(); const confirm = useConfirm();
  const del = async (a) => { if (await confirm({ title: 'Delete announcement?', message: `"${a.title}" will be removed.` })) act(async () => { await api.del(`/announcements/${a.id}`); l.reload(); }, 'Announcement deleted'); };
  const toggle = (a) => act(async () => { await api.patch(`/announcements/${a.id}`, { published: !a.published }); l.reload(); }, a.published ? 'Unpublished' : 'Published');
  return (
    <>
      <AdminHead title="Announcements" action={<button className="btn" onClick={() => setModal({})}>New announcement</button>}>Publish notices such as delays, postponements and timings.</AdminHead>
      <Async state={l} empty="No announcements yet.">{(list) => (
        <div className="tbl-wrap" style={{ marginTop: '1rem' }}><table><thead><tr><th>Title</th><th>Priority</th><th>Status</th><th /></tr></thead><tbody>{list.map((a) => (
          <tr key={a.id}><td><strong>{a.title}</strong><br /><span className="muted small">{fmtDate((a.created_at || '').slice(0, 10))}</span></td><td>{a.priority}</td><td>{a.published ? 'Published' : 'Draft'}</td>
            <td className="actions"><button className="btn sm ghost" onClick={() => toggle(a)}>{a.published ? 'Unpublish' : 'Publish'}</button> <button className="btn sm ghost" onClick={() => setModal({ a })}>Edit</button> <button className="btn sm danger" onClick={() => del(a)}>Delete</button></td></tr>))}</tbody></table></div>)}</Async>
      {modal && <AnnForm a={modal.a} onClose={() => setModal(null)} onDone={l.reload} />}
    </>
  );
}

// ---------- Winners ----------
function WinnerForm({ w, sports, onClose, onDone }) {
  const [v, setV, bind] = useForm({ sport_id: w?.sport_id || '', year: w?.year || 2026, champion_team_id: w?.champion_team_id || '', runner_up_team_id: w?.runner_up_team_id || '' });
  const slug = sports.find((s) => String(s.id) === String(v.sport_id))?.slug;
  const d = useAsync(() => (slug ? api.get(`/sports/${slug}`) : Promise.resolve(null)), [slug]);
  const teams = d.data?.teams || [];
  const finals = (d.data?.matches || []).filter((m) => m.status === 'completed' && m.winner);
  const prefill = (id) => { const m = finals.find((x) => String(x.id) === id); if (m) setV({ ...v, champion_team_id: m.winner.id, runner_up_team_id: m.winner.id === m.team1.id ? m.team2.id : m.team1.id }); };
  return (
    <FormModal title={w ? 'Edit winner' : 'Record a winner'} onClose={onClose} onSave={async () => { await (w ? api.patch(`/winners/${w.id}`, v) : api.post('/winners', v)); onDone(); }}
      validate={() => (!v.sport_id ? 'Choose a sport.' : !v.champion_team_id ? 'Choose the champion.' : '')}>
      <Field label="Sport"><select {...bind('sport_id')} onChange={(e) => setV({ ...v, sport_id: e.target.value, champion_team_id: '', runner_up_team_id: '' })}><option value="">Choose…</option>{sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Year"><input type="number" {...bind('year')} /></Field>
      {finals.length > 0 && <Field label="Fill from a completed match (optional)"><select defaultValue="" onChange={(e) => prefill(e.target.value)}><option value="">Choose a match…</option>{finals.map((m) => <option key={m.id} value={m.id}>{`${m.round?.name || m.match_type || 'Match'}: ${m.team1.name} vs ${m.team2.name}`}</option>)}</select></Field>}
      <Field label="Champion"><select {...bind('champion_team_id')}><option value="">{slug ? 'Choose…' : 'Choose a sport first'}</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      <Field label="Runner-up (optional)"><select {...bind('runner_up_team_id')}><option value="">None</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    </FormModal>
  );
}
export function WinnersAdmin() {
  usePageTitle('Manage Winners');
  const l = useAsync(() => api.get('/winners'), []); const sports = useAsync(() => api.get('/sports?all=1'), []);
  const [modal, setModal] = useState(null); const act = useAction(); const confirm = useConfirm();
  const del = async (w) => { if (await confirm({ title: 'Remove this winner?', message: `${w.champion} in ${w.sport} (${w.year}) will be removed from the public Winners page.`, confirmLabel: 'Remove' })) act(async () => { await api.del(`/winners/${w.id}`); l.reload(); }, 'Winner removed'); };
  return (
    <>
      <AdminHead title="Winners" action={<button className="btn" onClick={() => setModal({})}>Record winner</button>}>Mark the champion once a final is complete. Nothing appears publicly until you do.</AdminHead>
      <Async state={l} empty="No winners recorded yet.">{(list) => (
        <div className="tbl-wrap" style={{ marginTop: '1rem' }}><table><thead><tr><th>Sport</th><th>Year</th><th>Champion</th><th>Runner-up</th><th /></tr></thead><tbody>{list.map((w) => (
          <tr key={w.id}><td>{w.sport}</td><td>{w.year}</td><td><strong>{w.champion}</strong></td><td>{w.runner_up || '-'}</td><td className="actions"><button className="btn sm ghost" onClick={() => setModal({ w })}>Edit</button> <button className="btn sm danger" onClick={() => del(w)}>Remove</button></td></tr>))}</tbody></table></div>)}</Async>
      {modal && sports.data && <WinnerForm w={modal.w} sports={sports.data} onClose={() => setModal(null)} onDone={l.reload} />}
    </>
  );
}

// ---------- Admin management ----------
function AdminForm({ onClose, onDone }) {
  const [v, , bind] = useForm({ username: '', password: '', role: 'admin' });
  return (
    <FormModal title="Add an admin" onClose={onClose} onSave={async () => { await api.post('/admins', v); onDone(); }} validate={() => (v.username.trim().length < 3 ? 'Username needs at least 3 characters.' : v.password.length < 8 ? 'Password needs at least 8 characters.' : '')}>
      <Field label="Username"><input {...bind('username')} autoComplete="off" /></Field>
      <Field label="Temporary password" hint="They will be asked to change it after signing in."><input type="text" {...bind('password')} autoComplete="off" /></Field>
      <Field label="Role"><select {...bind('role')}><option value="admin">Admin</option><option value="super_admin">Super admin (can manage admins)</option></select></Field>
    </FormModal>
  );
}
export function AdminsAdmin() {
  usePageTitle('Admin Management');
  const { admin } = useAuth();
  const l = useAsync(() => api.get('/admins'), []);
  const [modal, setModal] = useState(null); const act = useAction(); const confirm = useConfirm();
  const patch = (a, b, msg) => act(async () => { await api.patch(`/admins/${a.id}`, b); l.reload(); }, msg);
  const reset = async (a) => { const pw = window.prompt(`New temporary password for ${a.username} (min 8 characters):`); if (pw) patch(a, { password: pw }, 'Password reset'); };
  const del = async (a) => { if (await confirm({ title: `Remove ${a.username}?`, message: 'This admin will no longer be able to sign in.', confirmLabel: 'Remove' })) act(async () => { await api.del(`/admins/${a.id}`); l.reload(); }, 'Admin removed'); };
  return (
    <>
      <AdminHead title="Admin management" action={<button className="btn" onClick={() => setModal(true)}>Add admin</button>}>Only super admins can see this page.</AdminHead>
      <Async state={l}>{(list) => (
        <div className="tbl-wrap" style={{ marginTop: '1rem' }}><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead><tbody>{list.map((a) => (
          <tr key={a.id}><td><strong>{a.username}</strong>{a.id === admin.id && ' (you)'}</td>
            <td><select aria-label={`Role for ${a.username}`} value={a.role} onChange={(e) => patch(a, { role: e.target.value }, 'Role updated')}><option value="admin">Admin</option><option value="super_admin">Super admin</option></select></td>
            <td>{a.active ? 'Active' : 'Disabled'}</td><td>{a.last_login_at ? new Date(a.last_login_at).toLocaleString('en-IN') : 'Never'}</td>
            <td className="actions"><button className="btn sm ghost" onClick={() => patch(a, { active: !a.active }, a.active ? 'Admin disabled' : 'Admin enabled')}>{a.active ? 'Disable' : 'Enable'}</button> <button className="btn sm ghost" onClick={() => reset(a)}>Reset password</button> <button className="btn sm danger" onClick={() => del(a)}>Remove</button></td></tr>))}</tbody></table></div>)}</Async>
      {modal && <AdminForm onClose={() => setModal(null)} onDone={l.reload} />}
    </>
  );
}

// ---------- Settings ----------
export function SettingsAdmin() {
  usePageTitle('Settings');
  const toast = useToast(); const { refresh } = useAuth();
  const s = useAsync(() => api.get('/settings'), []);
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' }); const [err, setErr] = useState('');
  const [fest, setFest] = useState(null);
  const savePw = async (e) => {
    e.preventDefault(); setErr('');
    if (pw.new_password.length < 8) return setErr('New password must be at least 8 characters.');
    if (pw.new_password !== pw.confirm) return setErr('The new passwords do not match.');
    try { await api.post('/auth/change-password', { current_password: pw.current_password, new_password: pw.new_password }); setPw({ current_password: '', new_password: '', confirm: '' }); toast('Password changed'); refresh(); } catch (x) { setErr(x.message); }
  };
  const f = fest || s.data || {};
  return (
    <>
      <AdminHead title="Settings" />
      <div className="grid g2" style={{ marginTop: '1rem' }}>
        <form className="card" onSubmit={savePw} noValidate style={{ display: 'grid', gap: '.8rem' }}><h3>Change your password</h3>
          <Field label="Current password"><input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters"><input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <Field label="Confirm new password"><input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          {err && <p className="err" role="alert">{err}</p>}<button className="btn">Change password</button></form>
        <Async state={s}>{() => (
          <form className="card" style={{ display: 'grid', gap: '.8rem' }} onSubmit={async (e) => { e.preventDefault(); try { await api.put('/settings', f); toast('Settings saved'); } catch (x) { toast.error(x.message); } }}><h3>Fest details</h3>
            <Field label="Fest name"><input value={f.fest_name || ''} onChange={(e) => setFest({ ...f, fest_name: e.target.value })} /></Field>
            <Field label="Year"><input value={f.fest_year || ''} onChange={(e) => setFest({ ...f, fest_year: e.target.value })} /></Field>
            <Field label="College name"><input value={f.college_name || ''} onChange={(e) => setFest({ ...f, college_name: e.target.value })} /></Field>
            <p className="hint">The year is used as the default for new winner records.</p><button className="btn">Save details</button></form>)}</Async>
      </div>
    </>
  );
}
