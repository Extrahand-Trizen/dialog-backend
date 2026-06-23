import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { apiKeyAuth } from '../../middleware/apiKeyAuth';
import { requireApiKeyScope } from '../../middleware/requireApiKeyScope';
import { validate } from '../../middleware/validate';
import { ingestEventSchema } from './notifications.schemas';
import { ingestEventHandler } from './notifications.handlers';

export function createNotificationsRouter(): Router {
  const router = Router();

  router.post(
    '/',
    apiKeyAuth,
    requireApiKeyScope('events:write'),
    validate(ingestEventSchema),
    asyncHandler(ingestEventHandler),
  );

  return router;
}
