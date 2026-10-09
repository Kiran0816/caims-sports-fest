const router = require('express').Router();
const db = require('../db');
const { wrap, HttpError, bad, now, str, int, date, time, url, parseJSON } = require('../lib');
const { requireAuth } = require('../middleware');
const { STATUSES, loadMatches, loadMatch, saveScores, decideWinner } = require('../matches-lib');
const { removeImage } = require('../upload');

const SCHEDULED = ['scheduled', 'upcoming', 'postponed', 'cancelled'];

// ---- public reads ----
router.get('/matches', wrap(async (req, res) => {
  const { sport, status, team, bucket } = req.query;
  const list = await loadMatches((q) => {
    if (sport) q.where((w) => w.where('s.slug', sport).orWhere('m.sport_id', Number(sport) || 0));
    if (team) q.where((w) => w.where('m.team1_id', Number(team)).orWhere('m.team2_id', Number(team)));
    if (bucket === 'schedule') q.whereIn('m.status', SCHEDULED);
    else if (bucket === 'results') q.where('m.status', 'completed');
    else if (status) q.whereIn('m.status', String(status).split(',').filter((x) => STATUSES.includes(x)));
    q.orderBy('m.match_date', bucket === 'results' ? 'desc' : 'asc').orderBy('m.match_time', bucket === 'results' ? 'desc' : 'asc');
  });
  res.json(list);
}));
router.get('/matches/live', wrap(async (req, res) => {
  res.json(await loadMatches((q) => q.where('m.status', 'live').orderBy('m.id'), { events: true }));
}));
router.get('/matches/:id', wrap(async (req, res) => {
  const m = await loadMatch(Number(req.params.id), { events: true });
  m.photos = await db('photos').where({ match_id: m.id }).orderBy('id', 'desc');
  res.json(m);
}));

// ---- validation for create / edit ----
async function matchInput(b, existing) {
  const sport_id = int(b.sport_id ?? existing?.sport_id, 'Sport', { required: true, min: 1 });
  const sport = await db('sports').where({ id: sport_id }).first();
  if (!sport) throw bad('Selected sport does not exist.');
  const team1_id = int(b.team1_id ?? existing?.team1_id, 'Team 1', { required: true, min: 1 });
  const team2_id = int(b.team2_id ?? existing?.team2_id, 'Team 2', { required: true, min: 1 });
  if (team1_id === team2_id) throw bad('A team cannot play against itself.');
  const enrolled = await db('sport_teams').where({ sport_id }).whereIn('team_id', [team1_id, team2_id]);
  if (enrolled.length !== 2) throw bad(`Both teams must be added to ${sport.name} first (Teams → manage sports).`);
  let round_id = b.round_id === '' ? null : int(b.round_id ?? existing?.round_id, 'Round', { min: 1 });
  if (round_id && !(await db('rounds').where({ id: round_id, sport_id }).first())) throw bad('That round belongs to a different sport.');
  const status = b.status ?? existing?.status ?? 'scheduled';
  if (!STATUSES.includes(status)) throw bad('Unknown match status.');
  if (['live', 'completed'].includes(status) && status !== existing?.status) throw bad('Use "Start live" or "End match" to move a match to live or completed.');
  return {
    sport_id, team1_id, team2_id, round_id, status,
    match_type: str(b.match_type ?? existing?.match_type, 'Match type', { max: 60 }),
    match_number: int(b.match_number ?? existing?.match_number, 'Match number', { min: 1, max: 999 }),
    match_date: date(b.date ?? existing?.match_date, 'Date'), match_time: time(b.time ?? existing?.match_time, 'Time'),
    venue: str(b.venue ?? existing?.venue, 'Venue', { max: 120 }), notes: str(b.notes ?? existing?.notes, 'Notes', { max: 1000 }),
    poster_url: url(b.poster_url ?? existing?.poster_url, 'Poster'),
  };
}
const idOf = (r) => (Array.isArray(r) ? (r[0].id ?? r[0]) : r);

router.post('/matches', requireAuth, wrap(async (req, res) => {
  const data = await matchInput(req.body);
  const id = idOf(await db('matches').insert({ ...data, created_at: now(), updated_at: now() }).returning('id'));
  res.status(201).json({ id });
}));
router.patch('/matches/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await db('matches').where({ id }).first();
  if (!cur) throw new HttpError(404, 'Match not found.');
  const teamsChanged = (req.body.team1_id && Number(req.body.team1_id) !== cur.team1_id) || (req.body.team2_id && Number(req.body.team2_id) !== cur.team2_id);
  if (teamsChanged && ['live', 'completed'].includes(cur.status)) throw bad('Teams cannot be changed once a match has started.');
  const data = await matchInput(req.body, cur);
  if (cur.status === 'live' && data.status !== 'live' && req.body.status) throw bad('End the live match first, or leave its status unchanged.');
  if (cur.status === 'completed' && req.body.status && req.body.status !== 'completed') { // reopening a result
    data.winner_team_id = null; data.summary = null;
    await db('match_scores').where({ match_id: id }).del();
  }
  await db('matches').where({ id }).update({ ...data, updated_at: now() });
  res.json({ ok: true });
}));
router.delete('/matches/:id', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const m = await db('matches').where({ id }).first();
  if (!m) throw new HttpError(404, 'Match not found.');
  await db('matches').where({ id }).del(); // scores/events cascade, photos keep but unlink
  removeImage(m.poster_url);
  res.json({ ok: true });
}));

// ---- live control ----
router.post('/matches/:id/live', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id), action = req.body.action;
  const cur = await db('matches').where({ id }).first();
  if (!cur) throw new HttpError(404, 'Match not found.');
  const m = await loadMatch(id);
  if (action === 'start') {
    if (!['scheduled', 'upcoming', 'postponed'].includes(cur.status)) throw bad(`A ${cur.status} match cannot be started.`);
    await db.transaction(async (trx) => {
      if (!m.score) {
        for (const t of [m.team1.id, m.team2.id]) await trx('match_scores').insert({ match_id: id, team_id: t, set_number: 0, points: 0 });
        if (m.sport.scoring_type === 'sets') for (const t of [m.team1.id, m.team2.id]) await trx('match_scores').insert({ match_id: id, team_id: t, set_number: 1, points: 0 });
      }
      const periods = m.sport.config.periods || [];
      await trx('matches').where({ id }).update({
        status: 'live', updated_at: now(), period: m.sport.scoring_type === 'sets' ? 'Set 1' : periods[0] || null,
        clock_started_at: m.sport.config.clock ? now() : null,
      });
    });
  } else {
    if (cur.status !== 'live') throw bad('This match is not live.');
    if (action === 'pause' && cur.clock_started_at) await db('matches').where({ id }).update({ clock_base_seconds: m.clock.seconds, clock_started_at: null, updated_at: now() });
    else if (action === 'resume' && !cur.clock_started_at) await db('matches').where({ id }).update({ clock_started_at: now(), updated_at: now() });
    else if (!['pause', 'resume'].includes(action)) throw bad('Unknown live action.');
  }
  res.json(await loadMatch(id, { events: true }));
}));

// Quick score update (one request per tap/save)
router.put('/matches/:id/score', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const m = await loadMatch(id);
  if (m.status !== 'live') throw bad('Scores can only be updated while a match is live. Start the match first.');
  const b = req.body;
  await db.transaction(async (trx) => {
    await saveScores(trx, m, b);
    const patch = { updated_at: now() };
    if (m.sport.scoring_type === 'sets') {
      const open = (b.sets || []).filter((s) => !s.finished).map((s) => Number(s.set)).sort((x, y) => x - y)[0];
      patch.period = open ? `Set ${open}` : m.period;
    } else if (b.period !== undefined) patch.period = str(b.period, 'Period', { max: 40 });
    if (b.clock_seconds !== undefined) {
      patch.clock_base_seconds = int(b.clock_seconds, 'Match time', { min: 0, max: 99999 });
      if (m.clock.running) patch.clock_started_at = now();
    }
    await trx('matches').where({ id }).update(patch);
  });
  res.json(await loadMatch(id, { events: true }));
}));

// Finish a match: validates score + winner. Also used to enter a result directly for a match that was never live.
router.post('/matches/:id/complete', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  let m = await loadMatch(id);
  if (!['live', 'completed', 'scheduled', 'upcoming', 'postponed'].includes(m.status)) throw bad('A cancelled match cannot be completed. Reschedule it first.');
  const hasScoreInput = req.body.team1 !== undefined || Array.isArray(req.body.sets);
  await db.transaction(async (trx) => {
    if (hasScoreInput) await saveScores(trx, m, req.body);
  });
  m = await loadMatch(id);
  const winner = decideWinner(m, req.body.winner_team_id);
  if (m.sport.scoring_type === 'sets' && m.sets.some((s) => !s.finished)) throw bad('Finish or remove the unfinished set before ending the match.');
  await db('matches').where({ id }).update({
    status: 'completed', winner_team_id: winner, summary: str(req.body.summary ?? m.summary, 'Summary', { max: 1500 }),
    clock_base_seconds: m.clock.seconds, clock_started_at: null, updated_at: now(),
  });
  res.json(await loadMatch(id, { events: true }));
}));

// ---- events (goals, cards, notes) ----
router.post('/matches/:id/events', requireAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const m = await loadMatch(id);
  const team_id = int(req.body.team_id, 'Team', { min: 1 });
  if (team_id && ![m.team1.id, m.team2.id].includes(team_id)) throw bad('Event team must be one of the match teams.');
  await db('match_events').insert({ match_id: id, team_id, minute: str(req.body.minute, 'Minute', { max: 12 }), event_type: str(req.body.type, 'Type', { max: 30 }) || 'note',
    description: str(req.body.description, 'Description', { required: true, max: 200 }), created_at: now() });
  await db('matches').where({ id }).update({ updated_at: now() });
  res.status(201).json((await loadMatch(id, { events: true })).events);
}));
router.delete('/matches/:id/events/:eventId', requireAuth, wrap(async (req, res) => {
  await db('match_events').where({ id: Number(req.params.eventId), match_id: Number(req.params.id) }).del();
  res.json({ ok: true });
}));
module.exports = router;
