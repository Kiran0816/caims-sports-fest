import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAsync, usePageTitle } from '../../services/hooks';
import { Async } from '../../components/ui';
import { AdminHead } from './shared';

export default function Dashboard() {
  usePageTitle('Admin Dashboard');
  const s = useAsync(() => api.get('/admin/stats'), []);
  const tiles = [['sports', 'Total sports', '/admin/sports'], ['teams', 'Total teams', '/admin/teams'], ['upcoming', 'Upcoming matches', '/admin/matches'], ['live', 'Live matches', '/admin/live'], ['completed', 'Completed matches', '/admin/results'], ['photos', 'Gallery photos', '/admin/gallery']];
  return (
    <>
      <AdminHead title="Dashboard">Overview of the fest.</AdminHead>
      <Async state={s}>{(d) => <div className="grid g3" style={{ marginTop: '1rem' }}>{tiles.map(([k, l, to]) => <Link key={k} to={to} className="stat" style={{ textDecoration: 'none' }}><b>{d[k]}</b>{l}</Link>)}</div>}</Async>
      <h3 style={{ margin: '2rem 0 .6rem' }}>Quick actions</h3>
      <div className="chips"><Link className="btn sm" to="/admin/matches">Schedule a match</Link><Link className="btn sm" to="/admin/live">Run a live match</Link><Link className="btn sm" to="/admin/announcements">Post an announcement</Link><Link className="btn sm" to="/admin/gallery">Upload photos</Link></div>
    </>
  );
}
