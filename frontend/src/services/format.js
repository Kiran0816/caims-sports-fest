export const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const fmtShortDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
export const ago = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};
export const STATUS_LABEL = { scheduled: 'Scheduled', upcoming: 'Upcoming', live: 'Live', completed: 'Completed', postponed: 'Postponed', cancelled: 'Cancelled' };
export const CATEGORIES = [['volleyball', 'Volleyball'], ['kabaddi', 'Kabaddi'], ['tug-of-war', 'Tug of War'], ['throw-ball', 'Throw Ball'], ['football', 'Football'],
  ['opening-ceremony', 'Opening Ceremony'], ['closing-ceremony', 'Closing Ceremony'], ['awards', 'Awards'], ['other', 'Other']];
export const todayISO = () => new Date().toISOString().slice(0, 10);
