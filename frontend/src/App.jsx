import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './services/auth';
import { ConfirmProvider, ToastProvider, Loading } from './components/ui';
import { AdminLayout, PublicLayout } from './components/Layout';
import Home from './pages/Home';
import { Sports, SportDetail } from './pages/Sports';
import { Schedule, Live, Results, MatchDetail } from './pages/Schedule';
import { Teams, Gallery, Announcements, Winners } from './pages/Content';
import Login from './pages/Login';

// Admin code is loaded only when an admin opens it, keeping the public site light.
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Matches = lazy(() => import('./pages/admin/Matches'));
const LiveAdmin = lazy(() => import('./pages/admin/Live'));
const lz = (C, pick) => lazy(() => C.then((m) => ({ default: m[pick] })));
const SportsAdmin = lz(import('./pages/admin/Catalog'), 'SportsAdmin');
const TeamsAdmin = lz(import('./pages/admin/Catalog'), 'TeamsAdmin');
const BracketsAdmin = lz(import('./pages/admin/Content'), 'BracketsAdmin');
const GalleryAdmin = lz(import('./pages/admin/Content'), 'GalleryAdmin');
const AnnouncementsAdmin = lz(import('./pages/admin/Content'), 'AnnouncementsAdmin');
const WinnersAdmin = lz(import('./pages/admin/Content'), 'WinnersAdmin');
const AdminsAdmin = lz(import('./pages/admin/Content'), 'AdminsAdmin');
const SettingsAdmin = lz(import('./pages/admin/Content'), 'SettingsAdmin');

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider><ToastProvider><ConfirmProvider>
        <Suspense fallback={<div className="wrap" style={{ padding: '2rem 0' }}><Loading rows={2} /></div>}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="sports" element={<Sports />} /><Route path="sports/:slug" element={<SportDetail />} />
              <Route path="schedule" element={<Schedule />} /><Route path="live" element={<Live />} /><Route path="results" element={<Results />} />
              <Route path="matches/:id" element={<MatchDetail />} />
              <Route path="teams" element={<Teams />} /><Route path="gallery" element={<Gallery />} /><Route path="announcements" element={<Announcements />} /><Route path="winners" element={<Winners />} />
              <Route path="*" element={<div className="wrap section"><div className="state">That page does not exist. <a href="/">Go to the home page</a>.</div></div>} />
            </Route>
            <Route path="admin/login" element={<Login />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="sports" element={<SportsAdmin />} /><Route path="teams" element={<TeamsAdmin />} />
              <Route path="matches" element={<Matches mode="upcoming" />} /><Route path="live" element={<LiveAdmin />} /><Route path="results" element={<Matches mode="results" />} />
              <Route path="brackets" element={<BracketsAdmin />} /><Route path="gallery" element={<GalleryAdmin />} /><Route path="announcements" element={<AnnouncementsAdmin />} />
              <Route path="winners" element={<WinnersAdmin />} /><Route path="admins" element={<AdminsAdmin />} /><Route path="settings" element={<SettingsAdmin />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ConfirmProvider></ToastProvider></AuthProvider>
    </BrowserRouter>
  );
}
