const jwt = require('jsonwebtoken');
const db = require('./db');
const { HttpError } = require('./lib');

const COOKIE = 'caims_session';
const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set to a random string of at least 32 characters.');
  return s;
};
const expiresIn = () => process.env.SESSION_EXPIRES || '8h';

function issueSession(res, adminId) {
  const token = jwt.sign({ sub: adminId }, secret(), { expiresIn: expiresIn() });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600 * 1000, path: '/',
  });
}
const clearSession = (res) => res.clearCookie(COOKIE, { path: '/' });

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    if (!token) throw new HttpError(401, 'Please sign in to continue.');
    let payload;
    try { payload = jwt.verify(token, secret()); } catch { throw new HttpError(401, 'Your session has expired. Please sign in again.'); }
    const admin = await db('admins').where({ id: payload.sub }).first();
    if (!admin || !admin.active) throw new HttpError(401, 'This account is not active.');
    req.admin = { id: admin.id, username: admin.username, role: admin.role, must_change_password: !!admin.must_change_password };
    next();
  } catch (e) { next(e); }
}
const requireSuper = (req, res, next) =>
  req.admin?.role === 'super_admin' ? next() : next(new HttpError(403, 'Only a super admin can do this.'));

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image is too large (10 MB maximum).' });
  const msg = String(err.message || '');
  if (err.code === '23505' || /UNIQUE constraint/i.test(msg)) return res.status(409).json({ error: 'That name or value already exists.' });
  if (err.code === '23503' || /FOREIGN KEY/i.test(msg)) return res.status(409).json({ error: 'This item is still used by other records, so the change was blocked.' });
  if (err.code === '23514' || /CHECK constraint/i.test(msg)) return res.status(400).json({ error: 'That change breaks a data rule (for example, a team cannot play itself).' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}
module.exports = { requireAuth, requireSuper, issueSession, clearSession, errorHandler };
