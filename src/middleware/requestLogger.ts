import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from '../infrastructure/logging/logger';

const CORRELATION_HEADER = 'x-correlation-id';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (typeof req.headers[CORRELATION_HEADER] === 'string' && req.headers[CORRELATION_HEADER]) ||
    randomUUID();

  req.correlationId = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);

  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('HTTP request', {
      correlationId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}
