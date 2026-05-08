import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import logger from './lib/logger.js';
import { initSentry, setupSentryErrorHandler } from './lib/sentry.js';
import { metricsMiddleware, metricsHandler } from './lib/metrics.js';
import { startScheduler } from './jobs/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT) || 3001;

// Sentry must be first
initSentry(app);

app.use(helmet({
  strictTransportSecurity: false,
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
app.use(cors({
  origin: origins[0] === '*' ? '*' : origins,
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(globalLimiter);

// Prometheus metrics
app.use(metricsMiddleware);
app.get('/metrics', metricsHandler);

// Serve frontend - root route with inlined JSX to avoid HTTPS upgrade issues
const publicDir = path.join(__dirname, '..', 'public');

app.get('/konbam', (_req, res) => res.sendFile(path.join(publicDir, 'Kanban Ads & Dropshipping.html')));

const jsxOrder = ['icons.jsx','utils.jsx','users.jsx','api.jsx','login.jsx','social.jsx','data.jsx','card.jsx','creative.jsx','tabs.jsx','modal.jsx','views.jsx','app.jsx'];

app.get('/', (_req, res) => {
  try {
    let html = fs.readFileSync(path.join(publicDir, 'Kanban Ads & Dropshipping.html'), 'utf-8');
    let inlineScripts = '';
    for (const file of jsxOrder) {
      const content = fs.readFileSync(path.join(publicDir, file), 'utf-8');
      inlineScripts += `\n<script type="text/babel" data-inline="${file}">${content}</script>`;
    }
    // Remove external JSX script tags and replace with inlined versions
    html = html.replace(/<script type="text\/babel" src="[^"]+"><\/script>/g, '');
    html = html.replace('</body>', inlineScripts + '\n</body>');
    res.type('html').send(html);
  } catch (err) {
    logger.error(err, 'Failed to serve frontend');
    res.status(500).send('Frontend error');
  }
});

app.use(express.static(publicDir));

// Request logging
app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: _res.statusCode,
      ms: Date.now() - start,
    }, 'request');
  });
  next();
});

app.use(routes);
app.use(notFoundHandler);

// Sentry error handler before our global handler
setupSentryErrorHandler(app);
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
  startScheduler();
});

export default app;
