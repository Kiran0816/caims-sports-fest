// End-to-end API test against a throwaway SQLite database. Run: npm test
process.env.DATABASE_URL = 'sqlite:./data/test.sqlite';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.ADMIN_INITIAL_PASSWORD = 'caimsfest2026#';
process.env.UPLOAD_DIR = require('os').tmpdir() + '/caims-test-uploads';
require('fs').rmSync(__dirname + '/../data/test.sqlite', { force: true });
const assert = require('assert');
const db = require('../src/db');
const createSchema = require('../../database/schema');
const seed = require('../../database/seed');
const sharp = require('sharp');

(async () => {
  await createSchema(db); await seed(db);
  const server = require('../src/server').createApp().listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  let cookie = '';
  const call = async (method, path, body, { raw } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), cookie }, body: raw || (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  let n = 0; const ok = (name, cond) => { assert(cond, name); console.log('  ok', ++n, name); };

  // --- auth ---
  ok('admin route blocked without login', (await call('POST', '/teams', { name: 'X' })).status === 401);
  ok('wrong password rejected', (await call('POST', '/auth/login', { username: 'admin', password: 'nope' })).status === 401);
  const login = await call('POST', '/auth/login', { username: 'admin', password: 'caimsfest2026#' });
  ok('login works + must_change_password flagged', login.status === 200 && login.body.admin.must_change_password);
  ok('password stored hashed', (await db('admins').first()).password_hash.startsWith('$2'));
  ok('/auth/me works', (await call('GET', '/auth/me')).body.admin.username === 'admin');

  // --- public data ---
  const sports = (await call('GET', '/sports')).body;
  ok('8 seeded sports', sports.length === 8);
  const home = (await call('GET', '/home')).body;
  ok('no fake live/results/winners', home.live.length === 0 && home.results.length === 0 && home.winners.length === 0);

  // --- teams / enrolment ---
  const teams = (await call('GET', '/teams')).body;
  const t = (name) => teams.find((x) => x.name === name).id;
  const fb = sports.find((s) => s.slug === 'mens-football').id, vb = sports.find((s) => s.slug === 'womens-volleyball').id;
  for (const x of ['2K24', '2K26', '2K23']) await call('POST', `/sports/${fb}/teams`, { team_id: t(x) });
  for (const x of ['2K25', '2K22']) await call('POST', `/sports/${vb}/teams`, { team_id: t(x) });
  const mk = (o) => call('POST', '/matches', { sport_id: fb, team1_id: t('2K24'), team2_id: t('2K26'), date: '2026-10-12', time: '16:00', venue: 'Main Ground', ...o });
  ok('team cannot play itself', (await mk({ team2_id: t('2K24') })).status === 400);
  ok('team not in sport rejected', (await mk({ team2_id: t('2K22') })).status === 400);
  ok('nonexistent team rejected', (await mk({ team2_id: 9999 })).status === 400);
  ok('bad date rejected', (await mk({ date: '2026-13-45' })).status === 400);
  const created = await mk({ match_type: 'Semi Final', match_number: 1 });
  ok('match created', created.status === 201);
  const mid = created.body.id;
  ok('cannot complete without score', (await call('POST', `/matches/${mid}/complete`, {})).status === 400);
  ok('cannot set live via PATCH', (await call('PATCH', `/matches/${mid}`, { status: 'live' })).status === 400);
  ok('score blocked before live', (await call('PUT', `/matches/${mid}/score`, { team1: 1, team2: 0 })).status === 400);

  // --- live scoring ---
  const started = await call('POST', `/matches/${mid}/live`, { action: 'start' });
  ok('match goes live with clock + 0-0', started.body.status === 'live' && started.body.score.team1 === 0 && started.body.clock.running);
  ok('live list has it', (await call('GET', '/matches/live')).body.length === 1);
  const upd = await call('PUT', `/matches/${mid}/score`, { team1: 2, team2: 1, period: '2nd Half', clock_seconds: 4334 });
  ok('score updated', upd.body.score.team1 === 2 && upd.body.period === '2nd Half' && upd.body.clock.seconds >= 4334);
  ok('negative score rejected', (await call('PUT', `/matches/${mid}/score`, { team1: -1, team2: 1 })).status === 400);
  ok('pause stops clock', (await call('POST', `/matches/${mid}/live`, { action: 'pause' })).body.clock.running === false);
  ok('event added', (await call('POST', `/matches/${mid}/events`, { minute: "72'", type: 'goal', team_id: t('2K24'), description: 'Goal' })).status === 201);
  ok('event for outside team rejected', (await call('POST', `/matches/${mid}/events`, { team_id: t('2K23'), description: 'x' })).status === 400);
  ok('winner must be participant', (await call('POST', `/matches/${mid}/complete`, { winner_team_id: t('2K23') })).status === 400);
  ok('winner must agree with score', (await call('POST', `/matches/${mid}/complete`, { winner_team_id: t('2K26') })).status === 400);
  const done = await call('POST', `/matches/${mid}/complete`, { summary: 'Close game.' });
  ok('match completed, winner auto 2K24', done.body.status === 'completed' && done.body.winner.name === '2K24');
  ok('result appears in sport page', (await call('GET', '/sports/mens-football')).body.matches[0].winner.name === '2K24');
  ok('results bucket', (await call('GET', '/matches?bucket=results')).body.length === 1);

  // --- team deletion protection ---
  ok('cannot delete team with history', (await call('DELETE', `/teams/${t('2K24')}`)).status === 409);
  ok('cannot unenrol team with matches', (await call('DELETE', `/sports/${fb}/teams/${t('2K24')}`)).status === 409);
  const tmp = await call('POST', '/teams', { name: 'Temp' });
  await call('POST', `/sports/${fb}/teams`, { team_id: tmp.body.id });
  ok('unused team deletes cleanly', (await call('DELETE', `/teams/${tmp.body.id}`)).status === 200);
  ok('duplicate team name rejected', (await call('POST', '/teams', { name: '2K21' })).status === 409);

  // --- volleyball sets ---
  const v = await call('POST', '/matches', { sport_id: vb, team1_id: t('2K25'), team2_id: t('2K22'), date: '2026-10-13', time: '10:00', round_id: '' });
  await call('POST', `/matches/${v.body.id}/live`, { action: 'start' });
  const sets = [{ set: 1, team1: 25, team2: 20, finished: true }, { set: 2, team1: 18, team2: 16, finished: false }];
  const vs = await call('PUT', `/matches/${v.body.id}/score`, { sets });
  ok('set scoring: sets won + current set', vs.body.score.team1 === 1 && vs.body.score.team2 === 0 && vs.body.period === 'Set 2');
  ok('cannot end with unfinished set', (await call('POST', `/matches/${v.body.id}/complete`, {})).status === 400);
  sets[1] = { set: 2, team1: 25, team2: 23, finished: true };
  ok('volleyball completes 2-0', (await call('POST', `/matches/${v.body.id}/complete`, { sets })).body.winner.name === '2K25');

  // --- standings only when configured ---
  ok('no standings until configured', (await call('GET', '/sports/mens-football')).body.standings === null);
  await call('PATCH', `/sports/${fb}`, { points_enabled: true, points_win: 3, points_draw: 1, points_loss: 0 });
  const st = (await call('GET', '/sports/mens-football')).body.standings;
  ok('standings computed from results', st[0].team.name === '2K24' && st[0].points === 3 && st[0].played === 1);

  // --- winners ---
  ok('winner must belong to sport', (await call('POST', '/winners', { sport_id: fb, year: 2026, champion_team_id: t('2K22') })).status === 400);
  ok('winner recorded', (await call('POST', '/winners', { sport_id: fb, year: 2026, champion_team_id: t('2K24'), runner_up_team_id: t('2K26') })).status === 201);
  ok('duplicate winner year blocked', (await call('POST', '/winners', { sport_id: fb, year: 2026, champion_team_id: t('2K24') })).status === 409);

  // --- announcements ---
  const an = await call('POST', '/announcements', { title: 'Hello', priority: 'urgent', published: false });
  ok('unpublished hidden from public', (await call('GET', '/announcements')).body.length === 0);
  await call('PATCH', `/announcements/${an.body.id}`, { published: true });
  ok('published visible', (await call('GET', '/announcements')).body.length === 1);

  // --- photo upload / delete ---
  const png = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#f00' } }).png().toBuffer();
  const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'a.png'); fd.append('category', 'football'); fd.append('sport_id', String(fb)); fd.append('match_id', String(mid));
  const up = await call('POST', '/photos', null, { raw: fd });
  ok('photo uploaded', up.status === 201 && up.body.url.endsWith('.webp'));
  ok('uploaded file is served', (await fetch(`http://localhost:${server.address().port}${up.body.thumb_url}`)).status === 200);
  const bad = new FormData(); bad.append('image', new Blob(['not an image'], { type: 'image/png' }), 'x.png');
  ok('fake image rejected', (await call('POST', '/photos', null, { raw: bad })).status === 400);
  ok('photo linked to match', (await call('GET', `/matches/${mid}`)).body.photos.length === 1);
  ok('photo deleted', (await call('DELETE', `/photos/${up.body.id}`)).status === 200);

  // --- admin management + authz ---
  ok('super admin creates admin', (await call('POST', '/admins', { username: 'helper', password: 'helper-pass-1', role: 'admin' })).status === 201);
  ok('cannot demote last super admin', (await call('PATCH', '/admins/1', { role: 'admin' })).status === 400);
  ok('cannot delete self', (await call('DELETE', '/admins/1')).status === 400);
  ok('password change works', (await call('POST', '/auth/change-password', { current_password: 'caimsfest2026#', new_password: 'new-strong-pass' })).status === 200);
  await call('POST', '/auth/logout');
  cookie = '';
  ok('after logout admin routes blocked', (await call('GET', '/admins')).status === 401);
  await call('POST', '/auth/login', { username: 'helper', password: 'helper-pass-1' });
  ok('regular admin cannot manage admins', (await call('GET', '/admins')).status === 403);
  ok('regular admin can manage matches', (await call('PATCH', `/matches/${mid}`, { venue: 'Ground 2' })).status === 200);
  ok('delete match works', (await call('DELETE', `/matches/${v.body.id}`)).status === 200);
  ok('errors hide internals', JSON.stringify((await call('GET', '/matches/abc')).body).indexOf('SQL') === -1);

  console.log(`\nAll ${n} checks passed.`); server.close(); await db.destroy();
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
