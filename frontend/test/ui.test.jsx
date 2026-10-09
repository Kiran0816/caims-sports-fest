// UI integration test: renders the real React app in jsdom against a RUNNING backend (default http://localhost:4000).
// Start the backend with a fresh seeded DB first (see README, "Running the tests").
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

const API = process.env.API_URL || 'http://localhost:4000';
let cookie = '';
beforeAll(() => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const r = await real(API + url, { ...opts, headers: { ...(opts.headers || {}), cookie } });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0].includes('=;') ? '' : sc.split(';')[0];
    return r;
  };
  window.scrollTo = () => {};
});
const go = (path) => { cleanup(); window.history.pushState({}, '', path); return render(<App />); };
const raw = async (m, p, b) => (await fetch(`/api${p}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b && JSON.stringify(b) })).json();

describe('public site (empty state, no fake data)', () => {
  it('home shows hero, honest empty states', async () => {
    go('/');
    expect(await screen.findByRole('heading', { level: 1, name: /CAIMS Sports Fest 2026/i })).toBeTruthy();
    expect(screen.getByText('VIEW LIVE MATCHES')).toBeTruthy();
    expect(await screen.findByText('No matches are currently live.')).toBeTruthy();
    expect(screen.getByText(/No results yet/)).toBeTruthy();
    expect(screen.getByText(/Champions will be announced/)).toBeTruthy();
  });
  it('sports page lists all 8 sports', async () => {
    go('/sports');
    expect(await screen.findByText("Men's Football")).toBeTruthy();
    expect(screen.getAllByRole('link').filter((l) => /\/sports\//.test(l.getAttribute('href'))).length).toBe(8);
  });
  it('teams page lists seeded teams', async () => {
    go('/teams');
    for (const t of ['2K21', '2K26', 'Staff']) expect((await screen.findAllByText(t)).length).toBeGreaterThan(0);
  });
  it('live page empty state', async () => { go('/live'); expect(await screen.findByText('No matches are currently live.')).toBeTruthy(); });
  it('unknown sport shows friendly error', async () => { go('/sports/nope'); expect(await screen.findByText(/Sport not found/)).toBeTruthy(); });
});

describe('admin flow through the UI', () => {
  it('redirects to login, rejects bad password, accepts the right one', async () => {
    const user = userEvent.setup();
    go('/admin');
    expect(await screen.findByRole('heading', { name: 'Admin login' })).toBeTruthy();
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect username or password.')).toBeTruthy();
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'caimsfest2026#');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(await screen.findByText('Total sports')).toBeTruthy();
    expect(await screen.findByText('You are using a temporary password.', { exact: false })).toBeTruthy();
  });

  it('every admin route renders its page', async () => {
    const pages = { '/admin/sports': 'Sports', '/admin/teams': 'Teams', '/admin/matches': 'Upcoming matches', '/admin/live': 'Live matches', '/admin/results': 'Results',
      '/admin/brackets': 'Tournament brackets', '/admin/gallery': 'Gallery', '/admin/announcements': 'Announcements', '/admin/winners': 'Winners', '/admin/admins': 'Admin management', '/admin/settings': 'Settings' };
    for (const [path, title] of Object.entries(pages)) {
      go(path);
      expect(await screen.findByRole('heading', { level: 2, name: title }), path).toBeTruthy();
    }
  });

  it('create team, enrol it, delete it with confirmation', async () => {
    const user = userEvent.setup();
    go('/admin/teams');
    await screen.findByText('2K21');
    await user.click(screen.getByRole('button', { name: 'Add team' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a team name.')).toBeTruthy(); // client-side validation
    await user.type(screen.getByLabelText('Team name'), 'Alumni');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Alumni')).toBeTruthy();
    const row = screen.getByText('Alumni').closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete Alumni?')).toBeTruthy(); // confirmation dialog
    await user.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1));
    await waitFor(() => expect(screen.queryByText('Alumni')).toBeNull());
  });

  it('create match, run football live via admin UI, public sees it, end match, result is public', async () => {
    const user = userEvent.setup();
    const sports = await (await fetch('/api/sports')).json(); const teams = await (await fetch('/api/teams')).json();
    const fb = sports.find((s) => s.slug === 'mens-football'); const id = (n) => teams.find((t) => t.name === n).id;
    for (const n of ['2K24', '2K26']) await raw('POST', `/sports/${fb.id}/teams`, { team_id: id(n) });

    go('/admin/matches');
    await screen.findByText(/No matches scheduled yet/);
    await user.click(screen.getByRole('button', { name: 'Create match' }));
    await user.selectOptions(screen.getByLabelText('Sport'), String(fb.id));
    await waitFor(() => expect(screen.getByLabelText('Team 1').querySelectorAll('option').length).toBeGreaterThan(2));
    await user.selectOptions(screen.getByLabelText('Team 1'), String(id('2K24')));
    await user.selectOptions(screen.getByLabelText('Team 2'), String(id('2K24')));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('A team cannot play against itself.')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Team 2'), String(id('2K26')));
    await user.type(screen.getByLabelText('Venue'), 'Main Ground');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('2K24 vs 2K26')).toBeTruthy();

    go('/admin/live');
    await screen.findByText(/No match is live/);
    await user.click(await screen.findByRole('button', { name: 'Start live' }));
    expect(await screen.findByLabelText("Men's Football live control")).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Plus one for 2K24' }));
    await user.click(screen.getByRole('button', { name: 'Plus one for 2K24' }));
    await user.click(screen.getByRole('button', { name: 'Plus one for 2K26' }));
    await user.click(screen.getByRole('button', { name: 'Save update' }));
    await waitFor(async () => { const l = await (await fetch('/api/matches/live')).json(); expect(l[0].score).toEqual({ team1: 2, team2: 1 }); });

    go('/live'); // public page shows the score
    const board = await screen.findByLabelText("Men's Football live score");
    expect(within(board).getByLabelText('Score 2 to 1')).toBeTruthy();

    go('/admin/live');
    const panel = await screen.findByLabelText("Men's Football live control");
    await user.click(within(panel).getByRole('button', { name: 'End match' }));
    await user.click(await screen.findByRole('button', { name: 'End match and publish result' }));
    await waitFor(async () => expect((await (await fetch('/api/matches/live')).json()).length).toBe(0));

    go('/results');
    expect(await screen.findByText('Winner: 2K24')).toBeTruthy();
  });

  it('volleyball set scoring via admin UI', async () => {
    const user = userEvent.setup();
    const sports = await (await fetch('/api/sports')).json(); const teams = await (await fetch('/api/teams')).json();
    const vb = sports.find((s) => s.slug === 'womens-volleyball'); const id = (n) => teams.find((t) => t.name === n).id;
    for (const n of ['2K25', '2K22']) await raw('POST', `/sports/${vb.id}/teams`, { team_id: id(n) });
    const m = await raw('POST', '/matches', { sport_id: vb.id, team1_id: id('2K25'), team2_id: id('2K22'), date: '2026-10-13', time: '10:00' });
    await raw('POST', `/matches/${m.id}/live`, { action: 'start' });
    go('/admin/live');
    const panel = await screen.findByLabelText("Women's Volleyball live control");
    for (let i = 0; i < 3; i++) await user.click(within(panel).getByRole('button', { name: 'Increase 2K25 points' }));
    await user.click(within(panel).getByRole('button', { name: 'Finish set' }));
    await user.click(within(panel).getByRole('button', { name: 'Save update' }));
    await waitFor(async () => { const l = await (await fetch('/api/matches/live')).json(); expect(l[0].sets[0]).toMatchObject({ team1: 3, team2: 0, finished: true }); expect(l[0].period).toBe('Set 2'); });
    go('/live');
    expect(await screen.findByText('Set 2')).toBeTruthy();
  });

  it('logout returns to login and protects admin', async () => {
    const user = userEvent.setup();
    go('/admin');
    await user.click(await screen.findByRole('button', { name: /Logout/ }));
    go('/admin/teams');
    expect(await screen.findByRole('heading', { name: 'Admin login' })).toBeTruthy();
  });
});
