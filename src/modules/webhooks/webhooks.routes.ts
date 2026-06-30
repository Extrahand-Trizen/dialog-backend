import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { metaWebhookReceiveHandler, metaWebhookVerifyHandler } from './webhooks.handlers';

export function createMetaWebhookRouter(): Router {
  const router = Router();

  router.get('/', asyncHandler(metaWebhookVerifyHandler));
  router.post('/', asyncHandler(metaWebhookReceiveHandler));

  return router;
}
