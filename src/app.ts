import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createCorsOptions } from './config/cors';
import { validateEnv } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { createV1Router } from './api/v1';
import { createMetaWebhookRouter } from './modules/webhooks';
import logger from './infrastructure/logging/logger';

export function createApp(): Application {
  const env = validateEnv();
  const app = express();

  app.use(helmet());
  app.use(cors(createCorsOptions(env)));
  app.use(requestLogger);

  // Meta webhooks require the raw body for HMAC signature verification.
  app.use(
    '/api/v1/webhooks/meta',
    express.raw({ type: 'application/json', limit: '2mb' }),
    createMetaWebhookRouter(),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(compression());

  if (env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  } else {
    app.use(
      morgan('combined', {
        stream: {
          write: (message: string) => logger.info(message.trim()),
        },
      }),
    );
  }

  app.get('/', (_req, res) => {
    res.status(200).json({
      success: true,
      message: 'TrizenDialog backend',
      data: {
        service: 'trizendialog-backend',
        health: '/api/v1/health',
        readiness: '/api/v1/health/ready',
      },
    });
  });

  app.use('/api/v1', createV1Router());

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
      errorCode: 'NOT_FOUND',
    });
  });

  app.use(errorHandler);

  return app;
}
