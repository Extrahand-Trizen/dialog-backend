import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { jwtAuth } from '../../middleware/jwtAuth';
import { requireAdmin } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import {
  getOutboundWebhookHandler,
  upsertOutboundWebhookHandler,
} from './outboundWebhooks.handlers';
import { upsertOutboundWebhookSchema } from './outboundWebhooks.schemas';

export function createOutboundWebhooksRouter(): Router {
  const router = Router();

  router.use(jwtAuth);

  router.get('/', asyncHandler(getOutboundWebhookHandler));
  router.put('/', requireAdmin, validate(upsertOutboundWebhookSchema), asyncHandler(upsertOutboundWebhookHandler));

  return router;
}
