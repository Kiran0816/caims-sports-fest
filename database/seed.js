// Seeds ONLY reference data: sports, teams and the first admin. No fake matches, scores or winners.
const bcrypt = require(require.resolve('bcryptjs', { paths: [require('path').join(__dirname, '../backend')] }));

const sports = [
  { name: "Women's Volleyball", gender: 'women', scoring_type: 'sets', cfg: { max_sets: 5, unit_label: 'Sets won' } },
  { name: "Men's Volleyball", gender: 'men', scoring_type: 'sets', cfg: { max_sets: 5, unit_label: 'Sets won' } },
  { name: "Women's Kabaddi", gender: 'women', scoring_type: 'simple', cfg: { clock: true, unit_label: 'Points', periods: ['1st Half', 'Half Time', '2nd Half'] } },
  { name: "Men's Kabaddi", gender: 'men', scoring_type: 'simple', cfg: { clock: true, unit_label: 'Points', periods: ['1st Half', 'Half Time', '2nd Half'] } },
  { name: "Women's Tug of War", gender: 'women', scoring_type: 'simple', cfg: { unit_label: 'Pulls won', periods: ['Pull 1', 'Pull 2', 'Pull 3'] } },
  { name: "Men's Tug of War", gender: 'men', scoring_type: 'simple', cfg: { unit_label: 'Pulls won', periods: ['Pull 1', 'Pull 2', 'Pull 3'] } },
  { name: "Women's Throw Ball", gender: 'women', scoring_type: 'sets', cfg: { max_sets: 3, unit_label: 'Sets won' } },
  { name: "Men's Football", gender: 'men', scoring_type: 'simple', cfg: { clock: true, unit_label: 'Goals', periods: ['1st Half', 'Half Time', '2nd Half', 'Extra Time', 'Penalties'] }, allow_draw: true },
];
const teams = ['2K21', '2K22', '2K23', '2K24', '2K25', '2K26', 'Staff'];
const slugify = (s) => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

module.exports = async function seed(db, env = process.env) {
  for (const [i, s] of sports.entries()) {
    const exists = await db('sports').where({ slug: slugify(s.name) }).first();
    if (!exists) {
      await db('sports').insert({
        name: s.name, slug: slugify(s.name), gender: s.gender, scoring_type: s.scoring_type,
        scoring_config: JSON.stringify(s.cfg), allow_draw: !!s.allow_draw, sort_order: i + 1,
      });
    }
  }
  for (const name of teams) {
    if (!(await db('teams').where({ name }).first())) await db('teams').insert({ name });
  }
  for (const [k, v] of Object.entries({ fest_name: 'CAIMS Sports Fest', fest_year: '2026', college_name: 'Chalmeda Anand Rao Institute of Medical Sciences' })) {
    if (!(await db('settings').where({ key: k }).first())) await db('settings').insert({ key: k, value: v });
  }
  const pw = env.ADMIN_INITIAL_PASSWORD;
  if (pw && !(await db('admins').first())) {
    await db('admins').insert({
      username: env.ADMIN_USERNAME || 'admin',
      password_hash: await bcrypt.hash(pw, 12),
      role: 'super_admin', active: true, must_change_password: true,
      created_at: new Date().toISOString(),
    });
    console.log(`Created super admin "${env.ADMIN_USERNAME || 'admin'}". Change the password after first login.`);
  } else if (!pw && !(await db('admins').first())) {
    console.warn('No ADMIN_INITIAL_PASSWORD set - no admin was created.');
  }
};
