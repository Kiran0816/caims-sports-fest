// Shared helpers: errors, validation, small utilities.
class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (msg) => new HttpError(400, msg);
const now = () => new Date().toISOString();

function str(v, name, { required = false, max = 255 } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw bad(`${name} is required.`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) throw bad(`${name} must be ${max} characters or fewer.`);
  return s;
}
function int(v, name, { required = false, min = 0, max = 100000 } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${name} is required.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}.`);
  return n;
}
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const slugify = (s) => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function date(v, name) {
  const s = str(v, name, { required: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw bad(`${name} must be a valid date (YYYY-MM-DD).`);
  return s;
}
function time(v, name) {
  const s = str(v, name, { required: true });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw bad(`${name} must be a valid time (HH:MM).`);
  return s;
}
const url = (v, name) => {
  const s = str(v, name, { max: 500 });
  if (s && !/^(\/uploads\/[\w.\-]+|https?:\/\/\S+)$/.test(s)) throw bad(`${name} must be an uploaded image or an http(s) link.`);
  return s;
};
const parseJSON = (s, fallback = {}) => { try { return typeof s === 'string' ? JSON.parse(s) : s || fallback; } catch { return fallback; } };

module.exports = { HttpError, wrap, bad, now, str, int, bool, slugify, date, time, url, parseJSON };
