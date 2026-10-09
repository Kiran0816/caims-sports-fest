# CAIMS Sports Fest 2026

Sports-fest portal for Chalmeda Anand Rao Institute of Medical Sciences: public site (schedule, live scores, results, teams, gallery, announcements, winners) plus a password-protected admin panel. Everything the admin manages is stored in the database.

## Stack
- **Frontend:** React 19 + Vite + React Router, hand-written CSS (no Tailwind; fewer build dependencies).
- **Backend:** Node 20+/Express 5, Knex query builder.
- **Database:** PostgreSQL in production, SQLite for local dev (same schema, same code).
- **Auth:** bcrypt hashes, JWT in an httpOnly cookie, roles `super_admin` / `admin`.
- **Images:** uploaded, re-encoded to WebP with `sharp` (1600px max + 480px thumbnail).

## Folder structure
```
backend/src/    server.js, lib.js (validation), middleware.js (auth/errors), matches-lib.js (scoring rules), upload.js
  routes/       auth.js (+admins), catalog.js (sports/teams/rounds), matches.js (+live), content.js (news/photos/winners/settings)
  db/           index.js (connection), cli.js (init/seed/reset)
backend/test/   smoke.test.js (55 API checks)
database/       schema.js (all tables), seed.js (sports, teams, first admin)
frontend/src/   pages/ (public), pages/admin/, components/, services/ (api, hooks, auth, format)
frontend/test/  ui.test.jsx (11 UI tests)
```

## Database
Tables: `admins, settings, sports, teams, sport_teams, rounds, matches, match_scores, match_events, announcements, photos, winners`.
- `sport_teams` links teams to individual sports. A match can only use teams enrolled in its sport.
- Team 1 and Team 2 are checked at the DB level to differ. Teams and sports with match history cannot be deleted (foreign keys use RESTRICT, and the API explains why).
- **Different scoring per sport:** each sport has a `scoring_type` and a JSON `scoring_config`.
  - `simple`: one running score (Football, Kabaddi, Tug of War). Optional clock, periods, and score label ("Goals", "Pulls won").
  - `sets`: set-by-set scoring (Volleyball, Throw Ball). Headline score = sets won, calculated from finished sets.
  - Scores live in `match_scores` (`set_number = 0` is the headline, `1..n` are sets).
  - Seeded formats are starting defaults. Edit them under Admin → Sports.
- **Points tables** are off by default. Turn one on per sport and enter the win/draw/loss points. Nothing is assumed.

## Run locally
```bash
npm run install:all
cp .env.example backend/.env        # then edit JWT_SECRET
npm run db:init                     # create tables
npm run db:seed                     # 8 sports, 7 teams, first admin
npm run dev:api                     # API on :4000
npm run dev:web                     # site on :5173 (proxies /api and /uploads)
```
Initial login: username `admin`, password `caimsfest2026#` (from `ADMIN_INITIAL_PASSWORD`). The account is flagged to change the password, and a banner links to Settings. **Change it before the event.**

`npm run db:reset` wipes and re-seeds (blocked when `NODE_ENV=production`).

## Authentication
- The password is stored only as a bcrypt hash. It never appears in frontend code, HTML, or browser storage.
- Login sets an httpOnly, SameSite=Lax cookie (Secure in production). Sessions expire after `SESSION_EXPIRES` (default 8h).
- Every admin request re-checks the database, so disabling an admin takes effect immediately.
- Login is rate-limited (10 attempts / 15 min / IP). Cross-site write requests are rejected.
- Super admins can add, disable, promote/demote, reset and remove admins. The last active super admin cannot be removed or demoted.

## Live scores (how it really works)
**Polling, not WebSockets.** Public pages ask the API every 5 seconds (Live page) or 8-20 seconds (other pages), only while the tab is visible. A connection-problem notice appears if requests fail. The match clock is kept by the server (start time + offset) and ticks on screen between polls.

## Admin guide
- **Add a sport:** Sports → Add sport. Choose the scoring format. Use "Teams" to pick participants.
- **Add / edit / delete a team:** Teams. Use "Sports" on a team row to choose which sports it plays.
- **Create a match:** Upcoming Matches → Create match. Only teams enrolled in the sport are offered. Edit, postpone, cancel, reschedule and delete are on the same row.
- **Update live scores:** Live Matches → Start live. Use +/- (or set steppers for volleyball), then **Save update**. Pause/resume the clock, correct the time, add events.
- **Publish a result:** End match (winner is taken from the score; you choose only for tie-breaks). For matches never scored live, use "Enter result". Results appear on the public site automatically.
- **Brackets (optional):** Tournament Brackets → add rounds, then assign matches to rounds.
- **Winners:** Winners → Record winner (can be pre-filled from a completed match). Nothing is shown publicly until you add it.
- **Photos:** Gallery → Upload photo (JPG/PNG/WebP, 10 MB). Set category, sport, match, featured.
- **Announcements:** create, set priority, publish/unpublish. Important and urgent notices show on top of the home page.

## Tests
```bash
cd backend && npm test                        # API: auth, rules, live, results, uploads (temp DB)
# UI tests need a running API on a freshly seeded DB:
npm run db:reset && npm run dev:api &         # then
cd frontend && npm test
```

## Deploy
1. Create a PostgreSQL database; set `DATABASE_URL` (and `DATABASE_SSL=true` if required).
2. Set `NODE_ENV=production`, a random `JWT_SECRET`, `ADMIN_INITIAL_PASSWORD`, `TRUST_PROXY=1`, and `UPLOAD_DIR` pointing at **persistent storage** (uploads are files on disk).
3. `npm run install:all && npm run build && npm run db:init && npm run db:seed && npm start`.
4. The Express server also serves the built frontend, so one process hosts everything. Serve it over **HTTPS** (required for the Secure session cookie).

## Known limits
- Polling means up to ~5 s delay for visitors.
- Uploaded files live on local disk. Use a persistent volume or add object storage for multi-server hosting.
- Match events are free-text notes (no player stats).
- The PostgreSQL path uses the same Knex code but was tested here only on SQLite.
