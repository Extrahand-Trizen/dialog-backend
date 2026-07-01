import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError';
import logger from '../../infrastructure/logging/logger';
import { ingestMetaWebhook, verifyMetaWebhookSubscription } from './webhooks.service';

export async function metaWebhookVerifyHandler(req: Request, res: Response): Promise<void> {
  try {
    const challenge = await verifyMetaWebhookSubscription({
      mode: typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : undefined,
      token: typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : undefined,
      challenge:
        typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : undefined,
    });
    res.status(200).send(challenge);
  } catch (error) {
    if (error instanceof AppError) {
      res.sendStatus(error.statusCode === 401 ? 403 : error.statusCode);
      return;
    }
    res.sendStatus(403);
  }
}

export async function metaWebhookReceiveHandler(req: Request, res: Response): Promise<void> {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  try {
    await ingestMetaWebhook({
      rawBody,
      signatureHeader:
        typeof req.headers['x-hub-signature-256'] === 'string'
          ? req.headers['x-hub-signature-256']
          : undefined,
      correlationId: req.correlationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook ingest failed';
    logger.warn('Meta webhook ingest failed — returning 200 to avoid Meta retries', {
      correlationId: req.correlationId,
      message,
    });
  }

  res.status(200).send('EVENT_RECEIVED');
}
