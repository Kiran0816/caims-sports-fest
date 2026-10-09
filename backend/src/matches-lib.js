// Match loading/serialisation and scoring rules shared by routes.
const db = require('./db');
const { HttpError, bad, now, int, parseJSON } = require('./lib');

const STATUSES = ['scheduled', 'upcoming', 'live', 'completed', 'postponed', 'cancelled'];
const sportCfg = (s) => parseJSON(s.scoring_config);

function clockSeconds(m) {
  let s = m.clock_base_seconds || 0;
  if (m.clock_started_at) s += Math.max(0, Math.floor((Date.now() - Date.parse(m.clock_started_at)) / 1000));
  return s;
}

async function loadMatches(modify = (q) => q, { events = false } = {}) {
  const rows = await db('matches as m')
    .join('sports as s', 's.id', 'm.sport_id')
    .join('teams as t1', 't1.id', 'm.team1_id')
    .join('teams as t2', 't2.id', 'm.team2_id')
    .leftJoin('rounds as r', 'r.id', 'm.round_id')
    .leftJoin('teams as w', 'w.id', 'm.winner_team_id')
    .select('m.*', 's.name as sport_name', 's.slug as sport_slug', 's.scoring_type', 's.scoring_config', 's.allow_draw',
      't1.name as team1_name', 't2.name as team2_name', 'r.name as round_name', 'r.order_index as round_order', 'w.name as winner_name')
    .modify(modify);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const scores = await db('match_scores').whereIn('match_id', ids).orderBy('set_number');
  const evs = events ? await db('match_events').whereIn('match_id', ids).orderBy('id', 'desc') : [];
  return rows.map((m) => {
    const cfg = parseJSON(m.scoring_config);
    const mine = scores.filter((x) => x.match_id === m.id);
    const pick = (team, set) => mine.find((x) => x.team_id === team && x.set_number === set);
    const head1 = pick(m.team1_id, 0), head2 = pick(m.team2_id, 0);
    const setNums = [...new Set(mine.filter((x) => x.set_number > 0).map((x) => x.set_number))];
    const out = {
      id: m.id,
      sport: { id: m.sport_id, name: m.sport_name, slug: m.sport_slug, scoring_type: m.scoring_type, config: cfg, allow_draw: !!m.allow_draw },
      match_type: m.match_type, match_number: m.match_number,
      round: m.round_id ? { id: m.round_id, name: m.round_name, order: m.round_order } : null,
      date: m.match_date, time: m.match_time, venue: m.venue, status: m.status, notes: m.notes,
      poster_url: m.poster_url, summary: m.summary,
      team1: { id: m.team1_id, name: m.team1_name }, team2: { id: m.team2_id, name: m.team2_name },
      winner: m.winner_team_id ? { id: m.winner_team_id, name: m.winner_name } : null,
      score: head1 && head2 ? { team1: head1.points, team2: head2.points } : null,
      sets: setNums.map((n) => ({
        set: n, team1: pick(m.team1_id, n)?.points ?? 0, team2: pick(m.team2_id, n)?.points ?? 0, finished: !!pick(m.team1_id, n)?.finished,
      })),
      period: m.period,
      clock: { enabled: !!cfg.clock, running: !!m.clock_started_at, seconds: clockSeconds(m) },
      updated_at: m.updated_at,
    };
    if (events) out.events = evs.filter((e) => e.match_id === m.id).map((e) => ({ id: e.id, minute: e.minute, type: e.event_type, description: e.description, team_id: e.team_id, created_at: e.created_at }));
    return out;
  });
}
async function loadMatch(id, opts) {
  const [m] = await loadMatches((q) => q.where('m.id', id), opts);
  if (!m) throw new HttpError(404, 'Match not found.');
  return m;
}

const nonNeg = (v, n) => int(v, n, { required: true, min: 0, max: 999 });

// Writes headline + per-set scores inside a transaction.
async function saveScores(trx, match, body) {
  const t1 = match.team1.id, t2 = match.team2.id;
  const upsert = async (team, set, points, finished) => {
    const where = { match_id: match.id, team_id: team, set_number: set };
    const row = await trx('match_scores').where(where).first();
    const data = { points, finished: !!finished };
    if (row) await trx('match_scores').where({ id: row.id }).update(data);
    else await trx('match_scores').insert({ ...where, ...data });
  };
  if (match.sport.scoring_type === 'sets') {
    if (!Array.isArray(body.sets)) throw bad('Set scores are required for this sport.');
    const max = match.sport.config.max_sets || 5;
    if (body.sets.length > max) throw bad(`This sport allows at most ${max} sets.`);
    const nums = new Set();
    let w1 = 0, w2 = 0;
    for (const s of body.sets) {
      const n = int(s.set, 'Set number', { required: true, min: 1, max: 20 });
      if (nums.has(n)) throw bad('Duplicate set number.');
      nums.add(n);
      const a = nonNeg(s.team1, 'Set score'), b = nonNeg(s.team2, 'Set score');
      const fin = !!s.finished;
      if (fin && a === b) throw bad(`Set ${n} cannot be finished with a tied score.`);
      await upsert(t1, n, a, fin); await upsert(t2, n, b, fin);
      if (fin) a > b ? w1++ : w2++;
    }
    await trx('match_scores').where({ match_id: match.id }).where('set_number', '>', 0).whereNotIn('set_number', [...nums]).del();
    await upsert(t1, 0, w1, false); await upsert(t2, 0, w2, false);
  } else {
    await upsert(t1, 0, nonNeg(body.team1, 'Team 1 score'), false);
    await upsert(t2, 0, nonNeg(body.team2, 'Team 2 score'), false);
  }
}

function decideWinner(match, requested) {
  if (!match.score) throw bad('Enter the final score before completing the match.');
  const { team1, team2 } = match.score;
  let winner = team1 > team2 ? match.team1.id : team2 > team1 ? match.team2.id : null;
  if (requested !== undefined && requested !== null && requested !== '') {
    const w = Number(requested);
    if (w !== match.team1.id && w !== match.team2.id) throw bad('The winner must be one of the two teams in this match.');
    if (winner && w !== winner) throw bad('The winner does not match the final score.');
    winner = w;
  }
  if (!winner && !match.sport.allow_draw) throw bad('The scores are tied. Choose the winner (for example after a tie-break).');
  return winner; // null = draw
}

async function standings(sport) {
  if (!sport.points_enabled) return null;
  const teams = await db('sport_teams as st').join('teams as t', 't.id', 'st.team_id').where('st.sport_id', sport.id).select('t.id', 't.name');
  const rows = new Map(teams.map((t) => [t.id, { team: t, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, points: 0 }]));
  const ms = await loadMatches((q) => q.where({ 'm.sport_id': sport.id, 'm.status': 'completed' }));
  for (const m of ms) {
    if (!m.score) continue;
    const a = rows.get(m.team1.id), b = rows.get(m.team2.id);
    if (!a || !b) continue;
    a.played++; b.played++;
    a.for += m.score.team1; a.against += m.score.team2; b.for += m.score.team2; b.against += m.score.team1;
    if (!m.winner) { a.drawn++; b.drawn++; a.points += sport.points_draw; b.points += sport.points_draw; }
    else {
      const [w, l] = m.winner.id === m.team1.id ? [a, b] : [b, a];
      w.won++; l.lost++; w.points += sport.points_win; l.points += sport.points_loss;
    }
  }
  return [...rows.values()].sort((x, y) => y.points - x.points || (y.for - y.against) - (x.for - x.against) || x.team.name.localeCompare(y.team.name));
}

module.exports = { STATUSES, loadMatches, loadMatch, saveScores, decideWinner, standings, clockSeconds, sportCfg, now };
