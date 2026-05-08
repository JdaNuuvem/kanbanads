import * as Sentry from '@sentry/node';

export function initSentry(app) {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
    ],
  });

  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

export function setupSentryErrorHandler(app) {
  if (!process.env.SENTRY_DSN) return;
  app.use(Sentry.Handlers.errorHandler());
}
