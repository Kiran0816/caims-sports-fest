// Announcements, photos, winners, settings, uploads, stats, home aggregate.
const router = require('express').Router();
const db = require('../db');
const { wrap, HttpError, bad, now, str, int, bool, url } = require('../lib');
const { requireAuth } = require('../middleware');
const { loadMatches } = require('../matches-lib');
const { upload, saveImage, removeImage } = require('../upload');

const idOf = (r) => (Array.isArray(r) ? (r[0].id ?? r[0]) : r);
const PRIORITY = { urgent: 0, important: 1, normal: 2 };
const CATEGORIES = ['volleyball', 'kabaddi', 'tug-of-war', 'throw-ball', 'football', 'opening-ceremony', 'closing-ceremony', 'awards', 'other'];

router.post('/uploads', requireAuth, upload.single('image'), wrap(async (req, res) => {
  if (!req.file) throw bad('Choose an image to upload.');
  res.status(201).json(await saveImage(req.file.buffer));
}));

// ---------- Announcements ----------
const annOut = (a) => ({ ...a, published: !!a.published });
router.get('/announcements', wrap(async (req, res) => {
  const rows = await db('announcements').where({ published: true }).orderBy('created_at', 'desc');
  res.json(rows.map(annOut).sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]));
}));
router.get('/admin/announcements', requireAuth, wrap(async (req, res) => res.json((await db('announcements').orderBy('created_at', 'desc')).map(annOut))));
function annInput(b) {
  const priority = b.priority ?? 'normal';
  if (!(priority in PRIORITY)) throw bad('Priority must be normal, important or urgent.');
  return { title: str(b.title, 'Title', { required: true, max: 150 }), body: str(b.body, 'Message', { max: 2000 }), priority, published: bool(b.published), image_url: url(b.image_url, 'Image') };
}
router.post('/announcements', requireAuth, wrap(async (req, res) => {
  res.status(201).json({ id: idOf(await db('announcements').insert({ ...annInput(req.body), created_at: now(), updated_at: now() }).returning('id')) });
}));
router.patch('/announcements/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await db('announcements').where({ id }).first();
  if (!cur) throw new HttpError(404, 'Announcement not found.');
  await db('announcements').where({ id }).update({ ...annInput({ ...cur, ...req.body }), updated_at: now() });
  res.json({ ok: true });
}));
router.delete('/announcements/:id', requireAuth, wrap(async (req, res) => {
  const a = await db('announcements').where({ id: Number(req.params.id) }).first();
  if (a) { await db('announcements').where({ id: a.id }).del(); removeImage(a.image_url); }
  res.json({ ok: true });
}));

// ---------- Photos ----------
const photoOut = (p) => ({ ...p, featured: !!p.featured });
router.get('/photos', wrap(async (req, res) => {
  const { category, sport_id, featured, limit } = req.query;
  res.json((await db('photos').modify((q) => {
    if (category) q.where({ category });
    if (sport_id) q.where({ sport_id: Number(sport_id) });
    if (featured === '1') q.where({ featured: true });
    q.orderBy('id', 'desc').limit(Math.min(Number(limit) || 200, 500));
  })).map(photoOut));
}));
async function photoInput(b) {
  const category = b.category ?? 'other';
  if (!CATEGORIES.includes(category)) throw bad('Unknown photo category.');
  const sport_id = int(b.sport_id, 'Sport', { min: 1 }), match_id = int(b.match_id, 'Match', { min: 1 });
  if (sport_id && !(await db('sports').where({ id: sport_id }).first())) throw bad('Selected sport does not exist.');
  if (match_id && !(await db('matches').where({ id: match_id }).first())) throw bad('Selected match does not exist.');
  return { caption: str(b.caption, 'Caption', { max: 200 }), category, sport_id, match_id, featured: bool(b.featured) };
}
router.post('/photos', requireAuth, upload.single('image'), wrap(async (req, res) => {
  if (!req.file) throw bad('Choose a photo to upload.');
  const data = await photoInput(req.body);
  const img = await saveImage(req.file.buffer);
  const id = idOf(await db('photos').insert({ ...data, ...img, created_at: now() }).returning('id'));
  res.status(201).json({ id, ...img });
}));
router.patch('/photos/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await db('photos').where({ id }).first();
  if (!cur) throw new HttpError(404, 'Photo not found.');
  await db('photos').where({ id }).update(await photoInput({ ...cur, ...req.body }));
  res.json({ ok: true });
}));
router.delete('/photos/:id', requireAuth, wrap(async (req, res) => {
  const p = await db('photos').where({ id: Number(req.params.id) }).first();
  if (p) { await db('photos').where({ id: p.id }).del(); removeImage(p.url, p.thumb_url); }
  res.json({ ok: true });
}));

// ---------- Winners ----------
const winnerRows = () => db('winners as w').join('sports as s', 's.id', 'w.sport_id').join('teams as c', 'c.id', 'w.champion_team_id').leftJoin('teams as r', 'r.id', 'w.runner_up_team_id')
  .select('w.id', 'w.sport_id', 'w.year', 'w.champion_team_id', 'w.runner_up_team_id', 's.name as sport', 's.gender as category', 's.slug as sport_slug', 'c.name as champion', 'r.name as runner_up')
  .orderBy(['w.year', 's.sort_order'], ['desc', 'asc']);
router.get('/winners', wrap(async (req, res) => res.json(await winnerRows())));
async function winnerInput(b) {
  const sport_id = int(b.sport_id, 'Sport', { required: true, min: 1 });
  const champion_team_id = int(b.champion_team_id, 'Champion', { required: true, min: 1 });
  const runner_up_team_id = int(b.runner_up_team_id, 'Runner-up', { min: 1 });
  const year = int(b.year, 'Year', { required: true, min: 2000, max: 2100 });
  if (runner_up_team_id === champion_team_id) throw bad('Champion and runner-up must be different teams.');
  const ok = await db('sport_teams').where({ sport_id }).whereIn('team_id', [champion_team_id, runner_up_team_id].filter(Boolean));
  if (ok.length !== (runner_up_team_id ? 2 : 1)) throw bad('Champion and runner-up must be teams that take part in this sport.');
  return { sport_id, champion_team_id, runner_up_team_id, year };
}
router.post('/winners', requireAuth, wrap(async (req, res) => {
  const data = await winnerInput(req.body);
  if (await db('winners').where({ sport_id: data.sport_id, year: data.year }).first()) throw new HttpError(409, 'A winner is already recorded for this sport and year. Edit it instead.');
  res.status(201).json({ id: idOf(await db('winners').insert(data).returning('id')) });
}));
router.patch('/winners/:id', requireAuth, wrap(async (req, res) => { await db('winners').where({ id: Number(req.params.id) }).update(await winnerInput(req.body)); res.json({ ok: true }); }));
router.delete('/winners/:id', requireAuth, wrap(async (req, res) => { await db('winners').where({ id: Number(req.params.id) }).del(); res.json({ ok: true }); }));

// ---------- Settings ----------
router.get('/settings', wrap(async (req, res) => res.json(Object.fromEntries((await db('settings')).map((s) => [s.key, s.value])))));
router.put('/settings', requireAuth, wrap(async (req, res) => {
  const allowed = { fest_name: 80, fest_year: 4, college_name: 120 };
  for (const [k, max] of Object.entries(allowed)) {
    if (req.body[k] === undefined) continue;
    const value = str(req.body[k], k, { required: true, max });
    if (k === 'fest_year') int(value, 'Year', { min: 2000, max: 2100 });
    const exists = await db('settings').where({ key: k }).first();
    exists ? await db('settings').where({ key: k }).update({ value }) : await db('settings').insert({ key: k, value });
  }
  res.json({ ok: true });
}));

// ---------- Stats + Home ----------
router.get('/admin/stats', requireAuth, wrap(async (req, res) => {
  const n = async (q) => Number((await q.count({ n: '*' }).first()).n);
  res.json({
    sports: await n(db('sports')), teams: await n(db('teams')),
    upcoming: await n(db('matches').whereIn('status', ['scheduled', 'upcoming'])), live: await n(db('matches').where({ status: 'live' })),
    completed: await n(db('matches').where({ status: 'completed' })), photos: await n(db('photos')),
  });
}));
router.get('/home', wrap(async (req, res) => {
  const [live, upcoming, results, sports, announcements, photos, winners] = await Promise.all([
    loadMatches((q) => q.where('m.status', 'live').orderBy('m.id')),
    loadMatches((q) => q.whereIn('m.status', ['scheduled', 'upcoming']).orderBy('m.match_date').orderBy('m.match_time').limit(6)),
    loadMatches((q) => q.where('m.status', 'completed').orderBy('m.updated_at', 'desc').limit(6)),
    db('sports').where({ active: true }).orderBy(['sort_order', 'id']).select('id', 'name', 'slug', 'gender', 'image_url'),
    db('announcements').where({ published: true }).orderBy('created_at', 'desc').limit(20),
    db('photos').where({ featured: true }).orderBy('id', 'desc').limit(8),
    winnerRows(),
  ]);
  res.json({ live, upcoming, results, sports, announcements: announcements.map(annOut).sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]).slice(0, 4), photos: photos.map(photoOut), winners });
}));
module.exports = router;
