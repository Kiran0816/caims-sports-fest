import { Link } from 'react-router-dom';
import { usePolling, usePageTitle } from '../services/hooks';
import { api } from '../services/api';
import { Section, Async, Empty } from '../components/ui';
import { MatchCard, Scoreboard } from '../components/Match';
import { AnnouncementCard } from './Content';
import { PhotoGrid, WinnerCard } from './Content';

export default function Home() {
  usePageTitle('', 'CAIMS Sports Fest 2026 at Chalmeda Anand Rao Institute of Medical Sciences: live scores, schedule, results, teams and photos.');
  const s = usePolling(() => api.get('/home'), 8000);
  const state = { ...s, reload: () => window.location.reload() };
  const d = s.data;
  const urgent = d?.announcements.filter((a) => a.priority !== 'normal') || [];
  return (
    <>
      <header className="hero">
        <div className="wrap">
          <h1>CAIMS Sports Fest 2026</h1>
          <p className="college">Chalmeda Anand Rao Institute of Medical Sciences</p>
          <Link to="/live" className="btn signal">VIEW LIVE MATCHES{d?.live.length > 0 && <span className="badge live" style={{ marginLeft: 6 }}><span className="live-dot" aria-hidden="true" />{d.live.length} live</span>}</Link>
          <div className="year" aria-hidden="true">2026</div>
        </div>
      </header>
      {urgent.length > 0 && <div className="wrap" style={{ marginTop: '1.5rem', display: 'grid', gap: '.7rem' }}>{urgent.map((a) => <AnnouncementCard key={a.id} a={a} />)}</div>}
      <Async state={state}>{(d) => (
        <>
          <Section title="Live matches" to="/live" linkText="Open live page">
            {d.live.length ? <div className="grid g2">{d.live.map((m) => <Scoreboard key={m.id} m={m} fetchedAt={s.updatedAt} />)}</div> : <Empty>No matches are currently live.</Empty>}
          </Section>
          <Section title="Upcoming matches" to="/schedule" alt>
            {d.upcoming.length ? <div className="grid g2">{d.upcoming.map((m) => <MatchCard key={m.id} m={m} />)}</div> : <Empty>No upcoming matches have been scheduled yet.</Empty>}
          </Section>
          <Section title="Recent results" to="/results">
            {d.results.length ? <div className="grid g2">{d.results.map((m) => <MatchCard key={m.id} m={m} />)}</div> : <Empty>No results yet. Completed matches will appear here.</Empty>}
          </Section>
          <Section title="Sports" to="/sports" alt>
            <div className="grid g3">{d.sports.map((sp) => <Link key={sp.id} to={`/sports/${sp.slug}`} className="sport-card"><h3>{sp.name}</h3><span className="meta">View matches and teams</span></Link>)}</div>
          </Section>
          <Section title="Latest announcements" to="/announcements">
            {d.announcements.length ? <div className="grid g2">{d.announcements.map((a) => <AnnouncementCard key={a.id} a={a} />)}</div> : <Empty>No announcements right now.</Empty>}
          </Section>
          <Section title="Photo gallery" to="/gallery" alt>
            {d.photos.length ? <PhotoGrid photos={d.photos} /> : <Empty>Photos will appear here once they are uploaded.</Empty>}
          </Section>
          <Section title="Champions" to="/winners">
            {d.winners.length ? <div className="grid g3">{d.winners.map((w) => <WinnerCard key={w.id} w={w} />)}</div> : <Empty>Champions will be announced after the finals.</Empty>}
          </Section>
        </>
      )}</Async>
    </>
  );
}
