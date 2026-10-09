const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const db = require('./db');
const { errorHandler } = require('./middleware');
const { uploadDir } = require('./upload');
const createSchema = require('../../database/schema');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY ? 1 : 0);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'https:'], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], scriptSrc: ["'self'"] } }, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  // Reject cross-site state changes (cookie is SameSite=Lax; this is a second layer).
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin) {
        try {
          const originUrl = new URL(origin);
          const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
          const isDevLocal = process.env.NODE_ENV !== 'production' && (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1');
          if (originUrl.host !== req.get('host') && !allowed.includes(origin) && !isDevLocal) {
            return res.status(403).json({ error: 'Cross-site request blocked.' });
          }
        } catch {
          return res.status(403).json({ error: 'Cross-site request blocked.' });
        }
      }
    }
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/uploads', express.static(uploadDir, { maxAge: '30d', immutable: true }));
  app.use('/api', require('./routes/auth'), require('./routes/catalog'), require('./routes/matches'), require('./routes/content'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  const dist = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  (async () => {
    await createSchema(db); // safe: only creates missing tables
    const port = process.env.PORT || 4000;
    createApp().listen(port, '0.0.0.0', () => console.log(`CAIMS Sports Fest API on http://localhost:${port}`));
  })().catch((e) => { console.error('Failed to start:', e.message); process.exit(1); });
}
module.exports = { createApp };
