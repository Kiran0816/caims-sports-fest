const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { wrap, HttpError, bad, now, str, bool } = require('../lib');
const { requireAuth, requireSuper, issueSession, clearSession } = require('../middleware');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' } });
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
const checkPassword = (p) => { if (!p || p.length < 8) throw bad('Password must be at least 8 characters.'); if (p.length > 100) throw bad('Password is too long.'); return p; };
const publicAdmin = (a) => ({ id: a.id, username: a.username, role: a.role, active: !!a.active, must_change_password: !!a.must_change_password, created_at: a.created_at, last_login_at: a.last_login_at });

router.post('/auth/login', loginLimiter, wrap(async (req, res) => {
  const username = str(req.body.username, 'Username', { required: true, max: 60 });
  const password = str(req.body.password, 'Password', { required: true, max: 100 });
  const admin = await db('admins').whereRaw('lower(username) = ?', [username.toLowerCase()]).first();
  const ok = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH); // constant-ish time
  if (!admin || !ok || !admin.active) throw new HttpError(401, 'Incorrect username or password.');
  await db('admins').where({ id: admin.id }).update({ last_login_at: now() });
  issueSession(res, admin.id);
  res.json({ admin: publicAdmin(admin) });
}));
router.post('/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });
router.get('/auth/me', requireAuth, (req, res) => res.json({ admin: req.admin }));

router.post('/auth/change-password', requireAuth, wrap(async (req, res) => {
  const admin = await db('admins').where({ id: req.admin.id }).first();
  if (!(await bcrypt.compare(String(req.body.current_password || ''), admin.password_hash))) throw bad('Current password is incorrect.');
  const next = checkPassword(req.body.new_password);
  if (next === req.body.current_password) throw bad('Choose a password different from the current one.');
  await db('admins').where({ id: admin.id }).update({ password_hash: await bcrypt.hash(next, 12), must_change_password: false });
  res.json({ ok: true });
}));

// ---- Admin management (super admin only) ----
router.get('/admins', requireAuth, requireSuper, wrap(async (req, res) => {
  res.json((await db('admins').orderBy('id')).map(publicAdmin));
}));
router.post('/admins', requireAuth, requireSuper, wrap(async (req, res) => {
  const username = str(req.body.username, 'Username', { required: true, max: 60 });
  if (!/^[\w.\-]{3,}$/.test(username)) throw bad('Username must be 3+ characters: letters, numbers, dot, dash or underscore.');
  const role = req.body.role === 'super_admin' ? 'super_admin' : 'admin';
  const [row] = await db('admins').insert({ username, role, password_hash: await bcrypt.hash(checkPassword(req.body.password), 12),
    active: true, must_change_password: true, created_at: now() }).returning('id');
  res.status(201).json({ id: row.id ?? row });
}));
router.patch('/admins/:id', requireAuth, requireSuper, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const target = await db('admins').where({ id }).first();
  if (!target) throw new HttpError(404, 'Admin not found.');
  const patch = {};
  if (req.body.role !== undefined) patch.role = req.body.role === 'super_admin' ? 'super_admin' : 'admin';
  if (req.body.active !== undefined) patch.active = bool(req.body.active);
  if (req.body.password) { patch.password_hash = await bcrypt.hash(checkPassword(req.body.password), 12); patch.must_change_password = true; }
  const losesSuper = target.role === 'super_admin' && ((patch.role && patch.role !== 'super_admin') || patch.active === false);
  if (losesSuper) {
    if (id === req.admin.id) throw bad('You cannot demote or disable your own account.');
    const others = await db('admins').where({ role: 'super_admin', active: true }).whereNot({ id }).first();
    if (!others) throw bad('At least one active super admin must remain.');
  }
  await db('admins').where({ id }).update(patch);
  res.json({ ok: true });
}));
router.delete('/admins/:id', requireAuth, requireSuper, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.admin.id) throw bad('You cannot remove your own account.');
  const target = await db('admins').where({ id }).first();
  if (!target) throw new HttpError(404, 'Admin not found.');
  if (target.role === 'super_admin') {
    const others = await db('admins').where({ role: 'super_admin', active: true }).whereNot({ id }).first();
    if (!others) throw bad('At least one active super admin must remain.');
  }
  await db('admins').where({ id }).del();
  res.json({ ok: true });
}));
module.exports = router;
