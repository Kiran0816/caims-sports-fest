// Sports, teams, rounds.
const router = require('express').Router();
const db = require('../db');
const { wrap, HttpError, bad, str, int, bool, slugify, url, parseJSON } = require('../lib');
const { requireAuth } = require('../middleware');
const { loadMatches, standings } = require('../matches-lib');
const { removeImage } = require('../upload');

const sportOut = (s) => ({ ...s, scoring_config: parseJSON(s.scoring_config), points_enabled: !!s.points_enabled, allow_draw: !!s.allow_draw, has_bracket: !!s.has_bracket, active: !!s.active });
const insertId = (r) => (Array.isArray(r) ? (r[0].id ?? r[0]) : r);

function sportInput(b, partial = false) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('name')) { out.name = str(b.name, 'Sport name', { required: true, max: 80 }); out.slug = slugify(out.name); if (!out.slug) throw bad('Sport name is not valid.'); }
  if (has('gender')) { if (!['men', 'women', 'open'].includes(b.gender)) throw bad('Category must be men, women or open.'); out.gender = b.gender; }
  if (has('scoring_type')) { if (!['simple', 'sets'].includes(b.scoring_type)) throw bad('Scoring type must be simple or sets.'); out.scoring_type = b.scoring_type; }
  if (has('scoring_config')) {
    const c = parseJSON(b.scoring_config);
    out.scoring_config = JSON.stringify({
      clock: !!c.clock, unit_label: str(c.unit_label, 'Score label', { max: 30 }) || undefined,
      periods: Array.isArray(c.periods) ? c.periods.map((p) => String(p).trim()).filter(Boolean).slice(0, 12) : [],
      max_sets: int(c.max_sets, 'Maximum sets', { min: 1, max: 9 }) ?? undefined,
    });
  }
  for (const k of ['points_enabled', 'allow_draw', 'has_bracket', 'active']) if (has(k)) out[k] = bool(b[k]);
  for (const k of ['points_win', 'points_draw', 'points_loss']) if (has(k)) out[k] = int(b[k], k.replace('_', ' '), { min: 0, max: 100 }) ?? 0;
  if (has('description')) out.description = str(b.description, 'Description', { max: 1000 });
  if (has('image_url')) out.image_url = url(b.image_url, 'Image');
  if (has('sort_order')) out.sort_order = int(b.sort_order, 'Sort order', { min: 0, max: 999 }) ?? 0;
  return out;
}

// ---------- Sports ----------
router.get('/sports', wrap(async (req, res) => {
  const all = req.query.all === '1';
  const sports = await db('sports').modify((q) => { if (!all) q.where({ active: true }); }).orderBy(['sort_order', 'id']);
  const counts = await db('sport_teams').select('sport_id').count({ n: '*' }).groupBy('sport_id');
  const live = await db('matches').where({ status: 'live' }).select('sport_id').count({ n: '*' }).groupBy('sport_id');
  const num = (rows, id) => Number(rows.find((r) => r.sport_id === id)?.n || 0);
  res.json(sports.map((s) => ({ ...sportOut(s), team_count: num(counts, s.id), live_count: num(live, s.id) })));
}));

router.get('/sports/:slug', wrap(async (req, res) => {
  const s = await db('sports').where({ slug: req.params.slug, active: true }).first();
  if (!s) throw new HttpError(404, 'Sport not found.');
  const [teams, rounds, matches, photos, winners, table] = await Promise.all([
    db('sport_teams as st').join('teams as t', 't.id', 'st.team_id').where('st.sport_id', s.id).select('t.*').orderBy('t.name'),
    db('rounds').where({ sport_id: s.id }).orderBy('order_index'),
    loadMatches((q) => q.where('m.sport_id', s.id).orderBy([{ column: 'm.match_date' }, { column: 'm.match_time' }])),
    db('photos').where({ sport_id: s.id }).orderBy('id', 'desc').limit(24),
    db('winners as w').join('teams as c', 'c.id', 'w.champion_team_id').leftJoin('teams as r', 'r.id', 'w.runner_up_team_id').where('w.sport_id', s.id)
      .select('w.id', 'w.year', 'c.name as champion', 'r.name as runner_up').orderBy('w.year', 'desc'),
    standings(s),
  ]);
  res.json({ sport: sportOut(s), teams, rounds, matches, photos, winners, standings: table });
}));

router.post('/sports', requireAuth, wrap(async (req, res) => {
  const data = sportInput(req.body);
  data.sort_order ??= (Number((await db('sports').max({ m: 'sort_order' }).first()).m) || 0) + 1;
  const id = insertId(await db('sports').insert(data).returning('id'));
  res.status(201).json({ id });
}));
router.patch('/sports/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await db('sports').where({ id }).first())) throw new HttpError(404, 'Sport not found.');
  const data = sportInput(req.body, true);
  if (Object.keys(data).length) await db('sports').where({ id }).update(data);
  res.json({ ok: true });
}));
router.delete('/sports/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const used = await db('matches').where({ sport_id: id }).first() || await db('winners').where({ sport_id: id }).first();
  if (used) throw new HttpError(409, 'This sport has matches or winners. Delete those first, or switch the sport to inactive to hide it.');
  await db('sports').where({ id }).del();
  res.json({ ok: true });
}));

// Teams inside a sport
router.post('/sports/:id/teams', requireAuth, wrap(async (req, res) => {
  const sport_id = Number(req.params.id), team_id = int(req.body.team_id, 'Team', { required: true, min: 1 });
  if (!(await db('sports').where({ id: sport_id }).first())) throw new HttpError(404, 'Sport not found.');
  if (!(await db('teams').where({ id: team_id }).first())) throw new HttpError(404, 'Team not found.');
  if (!(await db('sport_teams').where({ sport_id, team_id }).first())) await db('sport_teams').insert({ sport_id, team_id });
  res.status(201).json({ ok: true });
}));
router.delete('/sports/:id/teams/:teamId', requireAuth, wrap(async (req, res) => {
  const sport_id = Number(req.params.id), team_id = Number(req.params.teamId);
  const played = await db('matches').where({ sport_id }).andWhere((q) => q.where({ team1_id: team_id }).orWhere({ team2_id: team_id })).first();
  if (played) throw new HttpError(409, 'This team has matches in this sport. Delete or reassign those matches first.');
  await db('sport_teams').where({ sport_id, team_id }).del();
  res.json({ ok: true });
}));

// ---------- Teams ----------
router.get('/teams', wrap(async (req, res) => {
  const teams = await db('teams').orderBy('name');
  const links = await db('sport_teams as st').join('sports as s', 's.id', 'st.sport_id').where('s.active', true).select('st.team_id', 's.id', 's.name', 's.slug').orderBy('s.sort_order');
  res.json(teams.map((t) => ({ ...t, sports: links.filter((l) => l.team_id === t.id).map(({ id, name, slug }) => ({ id, name, slug })) })));
}));
function teamInput(b) {
  return { name: str(b.name, 'Team name', { required: true, max: 60 }), description: str(b.description, 'Description', { max: 600 }),
    logo_url: url(b.logo_url, 'Logo'), photo_url: url(b.photo_url, 'Team photo') };
}
router.post('/teams', requireAuth, wrap(async (req, res) => {
  const id = insertId(await db('teams').insert(teamInput(req.body)).returning('id'));
  res.status(201).json({ id });
}));
router.patch('/teams/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await db('teams').where({ id }).first())) throw new HttpError(404, 'Team not found.');
  await db('teams').where({ id }).update(teamInput(req.body));
  res.json({ ok: true });
}));
router.delete('/teams/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const team = await db('teams').where({ id }).first();
  if (!team) throw new HttpError(404, 'Team not found.');
  const m = await db('matches').where((q) => q.where({ team1_id: id }).orWhere({ team2_id: id }).orWhere({ winner_team_id: id })).count({ n: '*' }).first();
  const w = await db('winners').where((q) => q.where({ champion_team_id: id }).orWhere({ runner_up_team_id: id })).count({ n: '*' }).first();
  if (Number(m.n) || Number(w.n)) throw new HttpError(409, `${team.name} appears in ${m.n} match(es) and ${w.n} winner record(s). Delete or change those first so match history stays correct.`);
  await db('teams').where({ id }).del(); // sport_teams links cascade
  removeImage(team.logo_url, team.photo_url);
  res.json({ ok: true });
}));

// ---------- Rounds (tournament brackets) ----------
router.get('/rounds', wrap(async (req, res) => {
  res.json(await db('rounds').modify((q) => { if (req.query.sport_id) q.where({ sport_id: Number(req.query.sport_id) }); }).orderBy(['sport_id', 'order_index']));
}));
const roundInput = (b) => ({ name: str(b.name, 'Round name', { required: true, max: 60 }), order_index: int(b.order_index, 'Order', { min: 0, max: 99 }) ?? 0 });
router.post('/rounds', requireAuth, wrap(async (req, res) => {
  const sport_id = int(req.body.sport_id, 'Sport', { required: true, min: 1 });
  if (!(await db('sports').where({ id: sport_id }).first())) throw new HttpError(404, 'Sport not found.');
  const id = insertId(await db('rounds').insert({ sport_id, ...roundInput(req.body) }).returning('id'));
  res.status(201).json({ id });
}));
router.patch('/rounds/:id', requireAuth, wrap(async (req, res) => { await db('rounds').where({ id: Number(req.params.id) }).update(roundInput(req.body)); res.json({ ok: true }); }));
router.delete('/rounds/:id', requireAuth, wrap(async (req, res) => { await db('rounds').where({ id: Number(req.params.id) }).del(); res.json({ ok: true }); })); // matches keep existing, round set null
module.exports = router;
