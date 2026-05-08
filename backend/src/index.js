import 'dotenv/config';
import path from 'node:path';
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
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "http://localhost:3001"],
    },
  },
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

// Serve frontend static files
const publicDir = path.join(__dirname, '..', 'public');
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'Kanban Ads & Dropshipping.html')));
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
