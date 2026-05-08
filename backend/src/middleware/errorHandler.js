import logger from '../lib/logger.js';

export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = statusCode === 500 ? 'Erro interno do servidor' : err.message;

  if (statusCode === 500) {
    logger.error({ err, code }, 'Unhandled error');
  }

  res.status(statusCode).json({
    error: message,
    code,
    details: err.details || null,
  });
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
}
