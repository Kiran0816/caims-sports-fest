// Relational schema. Works on PostgreSQL (production) and SQLite (local/dev).
// Timestamps are ISO strings written by the app; match date/time are plain 'YYYY-MM-DD' / 'HH:MM' strings.
module.exports = async function createSchema(db) {
  const add = async (name, build) => {
    if (!(await db.schema.hasTable(name))) await db.schema.createTable(name, build);
  };

  await add('admins', (t) => {
    t.increments('id');
    t.string('username').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('role').notNullable().defaultTo('admin'); // 'super_admin' | 'admin'
    t.boolean('active').notNullable().defaultTo(true);
    t.boolean('must_change_password').notNullable().defaultTo(false);
    t.string('created_at');
    t.string('last_login_at');
  });

  await add('settings', (t) => {
    t.string('key').primary();
    t.text('value');
  });

  await add('sports', (t) => {
    t.increments('id');
    t.string('name').notNullable().unique();
    t.string('slug').notNullable().unique();
    t.string('gender').notNullable().defaultTo('open'); // men | women | open
    t.string('scoring_type').notNullable().defaultTo('simple'); // simple | sets
    t.text('scoring_config').notNullable().defaultTo('{}'); // {clock,unit_label,periods[],max_sets}
    t.boolean('points_enabled').notNullable().defaultTo(false);
    t.integer('points_win').notNullable().defaultTo(0);
    t.integer('points_draw').notNullable().defaultTo(0);
    t.integer('points_loss').notNullable().defaultTo(0);
    t.boolean('allow_draw').notNullable().defaultTo(false);
    t.boolean('has_bracket').notNullable().defaultTo(false);
    t.text('description');
    t.string('image_url');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
  });

  await add('teams', (t) => {
    t.increments('id');
    t.string('name').notNullable().unique();
    t.text('description');
    t.string('logo_url');
    t.string('photo_url');
  });

  await add('sport_teams', (t) => {
    t.increments('id');
    t.integer('sport_id').notNullable().references('sports.id').onDelete('CASCADE');
    t.integer('team_id').notNullable().references('teams.id').onDelete('CASCADE');
    t.unique(['sport_id', 'team_id']);
  });

  await add('rounds', (t) => {
    t.increments('id');
    t.integer('sport_id').notNullable().references('sports.id').onDelete('CASCADE');
    t.string('name').notNullable();
    t.integer('order_index').notNullable().defaultTo(0);
    t.unique(['sport_id', 'name']);
  });

  await add('matches', (t) => {
    t.increments('id');
    t.integer('sport_id').notNullable().references('sports.id').onDelete('RESTRICT');
    t.integer('round_id').references('rounds.id').onDelete('SET NULL');
    t.string('match_type');
    t.integer('match_number');
    t.integer('team1_id').notNullable().references('teams.id').onDelete('RESTRICT');
    t.integer('team2_id').notNullable().references('teams.id').onDelete('RESTRICT');
    t.string('match_date').notNullable();
    t.string('match_time').notNullable();
    t.string('venue');
    t.string('status').notNullable().defaultTo('scheduled'); // scheduled|upcoming|live|completed|postponed|cancelled
    t.text('notes');
    t.string('poster_url');
    t.text('summary');
    t.integer('winner_team_id').references('teams.id').onDelete('RESTRICT');
    t.string('period'); // "Set 2", "2nd Half"...
    t.integer('clock_base_seconds').notNullable().defaultTo(0);
    t.string('clock_started_at'); // ISO, null when paused/stopped
    t.string('created_at');
    t.string('updated_at');
    t.check('?? <> ??', ['team1_id', 'team2_id'], 'chk_distinct_teams');
    t.index(['sport_id']);
    t.index(['status']);
    t.index(['match_date']);
  });

  await add('match_scores', (t) => {
    t.increments('id');
    t.integer('match_id').notNullable().references('matches.id').onDelete('CASCADE');
    t.integer('team_id').notNullable().references('teams.id').onDelete('RESTRICT');
    t.integer('set_number').notNullable().defaultTo(0); // 0 = headline score (goals, raids, sets won...)
    t.integer('points').notNullable().defaultTo(0);
    t.boolean('finished').notNullable().defaultTo(false); // for set rows
    t.unique(['match_id', 'team_id', 'set_number']);
  });

  await add('match_events', (t) => {
    t.increments('id');
    t.integer('match_id').notNullable().references('matches.id').onDelete('CASCADE');
    t.integer('team_id').references('teams.id').onDelete('SET NULL');
    t.string('minute');
    t.string('event_type').notNullable().defaultTo('note');
    t.string('description').notNullable();
    t.string('created_at');
  });

  await add('announcements', (t) => {
    t.increments('id');
    t.string('title').notNullable();
    t.text('body');
    t.string('priority').notNullable().defaultTo('normal'); // normal | important | urgent
    t.boolean('published').notNullable().defaultTo(false);
    t.string('image_url');
    t.string('created_at');
    t.string('updated_at');
  });

  await add('photos', (t) => {
    t.increments('id');
    t.string('url').notNullable();
    t.string('thumb_url');
    t.string('caption');
    t.string('category').notNullable().defaultTo('other');
    t.integer('sport_id').references('sports.id').onDelete('SET NULL');
    t.integer('match_id').references('matches.id').onDelete('SET NULL');
    t.boolean('featured').notNullable().defaultTo(false);
    t.string('created_at');
  });

  await add('winners', (t) => {
    t.increments('id');
    t.integer('sport_id').notNullable().references('sports.id').onDelete('RESTRICT');
    t.integer('year').notNullable();
    t.integer('champion_team_id').notNullable().references('teams.id').onDelete('RESTRICT');
    t.integer('runner_up_team_id').references('teams.id').onDelete('RESTRICT');
    t.unique(['sport_id', 'year']);
  });
};
