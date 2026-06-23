import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError';
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
    res.sendStatus(500);
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
    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    if (error instanceof AppError) {
      res.sendStatus(error.statusCode);
      return;
    }
    res.sendStatus(500);
  }
}
