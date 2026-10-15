require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const knex = require('knex');

const url = process.env.DATABASE_URL || 'sqlite:./data/caims.sqlite';
const isPg = /^postgres(ql)?:/.test(url);
let config;
if (isPg) {
  config = {
    client: 'pg',
    connection: { connectionString: url, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } },
    pool: { min: 0, max: 10 },
  };
} else {
  const file = path.resolve(__dirname, '../..', url.replace(/^sqlite:/, ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  config = {
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
    pool: { afterCreate: (conn, done) => { conn.pragma('foreign_keys = ON'); done(null, conn); } },
  };
}
const db = knex(config);
db.isPg = isPg;
module.exports = db;
