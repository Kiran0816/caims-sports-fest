const db = require('./index');
const createSchema = require('../../../database/schema');
const seed = require('../../../database/seed');
const TABLES = ['winners', 'photos', 'announcements', 'match_events', 'match_scores', 'matches', 'rounds', 'sport_teams', 'teams', 'sports', 'settings', 'admins'];

(async () => {
  const cmd = process.argv[2];
  try {
    if (cmd === 'reset') {
      if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database.');
      for (const t of TABLES) await db.schema.dropTableIfExists(t);
    }
    if (['init', 'seed', 'reset'].includes(cmd)) { await createSchema(db); console.log('Schema ready.'); }
    if (['seed', 'reset'].includes(cmd)) { await seed(db); console.log('Seed complete.'); }
    if (!['init', 'seed', 'reset'].includes(cmd)) console.log('Usage: node cli.js init|seed|reset');
  } catch (e) { console.error('Database command failed:', e.message); process.exitCode = 1; }
  await db.destroy();
})();
